-- Virtual-only owner-approved crew transfers and automatic fictional completion.
-- Deliberately isolated from real crew_location_events, tickets and accounting.
ALTER TABLE public.shadow_crew_movements DROP CONSTRAINT shadow_crew_movements_source_kind_check;
ALTER TABLE public.shadow_crew_movements ADD CONSTRAINT shadow_crew_movements_source_kind_check
 CHECK (source_kind IN ('charter','ferry','ground'));

CREATE TABLE public.shadow_crew_transfer_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 shadow_flight_id uuid NOT NULL,
 employee_id uuid NOT NULL,
 assignment_id uuid NOT NULL,
 created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
 from_icao text NOT NULL CHECK(from_icao ~ '^[A-Z0-9]{4}$'),
 to_icao text NOT NULL CHECK(to_icao ~ '^[A-Z0-9]{4}$'),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 report_at timestamptz NOT NULL,
 itinerary jsonb NOT NULL CHECK(jsonb_typeof(itinerary)='array'
  AND jsonb_array_length(itinerary) BETWEEN 1 AND 2),
 estimated_cost_eur numeric(14,2) NOT NULL CHECK(estimated_cost_eur>=0),
 state text NOT NULL DEFAULT 'planned' CHECK(state IN
 ('planned','enroute','completed_virtual','blocked_location','blocked_time','blocked_conflict')),
 state_reason text NOT NULL DEFAULT 'Owner-approved fictional travel itinerary',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only),
 UNIQUE(organization_id,employee_id,shadow_flight_id),
 UNIQUE(id,organization_id),
 CHECK(starts_at<ends_at AND ends_at<=report_at),
 FOREIGN KEY (shadow_flight_id,organization_id) REFERENCES public.shadow_flights(id,organization_id),
 FOREIGN KEY (employee_id,organization_id) REFERENCES public.employees(id,organization_id),
 FOREIGN KEY (assignment_id,organization_id) REFERENCES public.shadow_crew_assignments(id,organization_id)
);
CREATE INDEX shadow_crew_transfer_due_idx ON public.shadow_crew_transfer_orders(state,starts_at);
CREATE INDEX shadow_crew_transfer_person_idx ON public.shadow_crew_transfer_orders
 (organization_id,employee_id,starts_at);

CREATE TABLE public.shadow_crew_transfer_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 transfer_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN
  ('planned','departed','arrived','blocked_location','blocked_time','blocked_conflict')),
 event_at timestamptz NOT NULL,
 narrative text NOT NULL,
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only),
 UNIQUE(transfer_id,event_type),
 FOREIGN KEY(transfer_id,organization_id) REFERENCES public.shadow_crew_transfer_orders(id,organization_id)
);
CREATE TABLE public.shadow_crew_travel_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 transfer_id uuid NOT NULL,
 amount_eur numeric(14,2) NOT NULL CHECK(amount_eur>=0),
 expense_kind text NOT NULL DEFAULT 'crew_ground_transport_simulated'
  CHECK(expense_kind='crew_ground_transport_simulated'),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only),
 cash_movement boolean NOT NULL DEFAULT false CHECK(NOT cash_movement),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(transfer_id),
 FOREIGN KEY(transfer_id,organization_id) REFERENCES public.shadow_crew_transfer_orders(id,organization_id)
);

DO $access$ DECLARE v_table text; BEGIN
 FOREACH v_table IN ARRAY ARRAY[
 'shadow_crew_transfer_orders','shadow_crew_transfer_events','shadow_crew_travel_expenses'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
  EXECUTE format('REVOKE ALL ON public.%I FROM public,anon,authenticated',v_table);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',v_table);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
    USING(EXISTS(SELECT 1 FROM public.organizations o WHERE
     o.id=organization_id AND o.owner_user_id=(SELECT auth.uid())))',
    v_table||'_owner_read',v_table);
 END LOOP;
END $access$;
GRANT INSERT ON public.shadow_crew_transfer_orders TO authenticated;
CREATE POLICY shadow_crew_transfer_owner_insert ON public.shadow_crew_transfer_orders
 FOR INSERT TO authenticated WITH CHECK(
 created_by_user_id=(SELECT auth.uid()) AND simulation_only=true AND state='planned'
 AND created_at BETWEEN now()-interval '5 minutes' AND now()+interval '1 minute'
 AND EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=organization_id
  AND o.owner_user_id=(SELECT auth.uid()))
);
CREATE TRIGGER shadow_crew_transfer_events_immutable BEFORE UPDATE OR DELETE
 ON public.shadow_crew_transfer_events FOR EACH ROW
 EXECUTE FUNCTION ops_internal.prevent_sim_ledger_mutation();
CREATE TRIGGER shadow_crew_expenses_immutable BEFORE UPDATE OR DELETE
 ON public.shadow_crew_travel_expenses FOR EACH ROW
 EXECUTE FUNCTION ops_internal.prevent_sim_ledger_mutation();

-- Database recomputes every itinerary price and duration from owner-owned routes.
-- A user cannot forge a free/instant route through a hidden HTML field.
CREATE FUNCTION ops_internal.validate_shadow_crew_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
 v_flight record; v_prev text; v_end timestamptz;
 v_route record; v_leg jsonb; v_first timestamptz; v_last timestamptz;
 v_from text; v_to text; v_cost numeric(14,2):=0; v_expected_report timestamptz;
 v_depart timestamptz; v_arrive timestamptz;
 v_count integer:=0; v_last_arrival timestamptz;
BEGIN
 IF (SELECT auth.uid()) IS DISTINCT FROM NEW.created_by_user_id
  OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=NEW.organization_id
   AND o.owner_user_id=(SELECT auth.uid())) THEN
   RAISE EXCEPTION 'Unauthorized virtual crew transfer';
 END IF;
 PERFORM 1 FROM public.employees e WHERE e.id=NEW.employee_id
  AND e.organization_id=NEW.organization_id AND e.crew_role IN ('PIC','SIC') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown PIC/SIC'; END IF;
 SELECT f.* INTO v_flight FROM public.shadow_flights f
  WHERE f.id=NEW.shadow_flight_id AND f.organization_id=NEW.organization_id;
 IF NOT FOUND OR v_flight.status<>'planned' OR NOT v_flight.simulation_only
  OR v_flight.departure_at<=now()+interval '10 minutes' THEN
  RAISE EXCEPTION 'Not an upcoming synthetic flight';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shadow_crew_assignments a
    WHERE a.id=NEW.assignment_id AND a.employee_id=NEW.employee_id
    AND a.shadow_flight_id=NEW.shadow_flight_id AND a.organization_id=NEW.organization_id)
 THEN RAISE EXCEPTION 'Crew must first be assigned to the simulated flight'; END IF;
 SELECT l.proposed_departure_at - interval '1 hour' INTO v_expected_report
 FROM public.shadow_positioning_legs l
 WHERE l.shadow_flight_id=NEW.shadow_flight_id AND l.organization_id=NEW.organization_id
  AND l.status IN ('planned','enroute');
 IF v_expected_report IS NULL THEN
  v_expected_report:=v_flight.departure_at-interval '1 hour';
 END IF;
 IF NEW.starts_at<=now() OR NEW.ends_at>NEW.report_at
  OR NEW.report_at IS DISTINCT FROM v_expected_report
  OR NEW.estimated_cost_eur<0 THEN
   RAISE EXCEPTION 'Invalid transfer or crew report window';
 END IF;
 -- Simplified virtual rest buffer after any previous completed synthetic duty.
 IF EXISTS(SELECT 1 FROM public.shadow_crew_movements m
   WHERE m.organization_id=NEW.organization_id AND m.employee_id=NEW.employee_id
    AND m.status='completed_virtual' AND m.arrived_at<=NEW.starts_at
    AND NEW.starts_at<m.arrived_at+interval '11 hours 30 minutes'
 ) THEN RAISE EXCEPTION 'Insufficient virtual crew rest before travel'; END IF;
 IF EXISTS(SELECT 1 FROM public.shadow_crew_transfer_orders p WHERE
    p.organization_id=NEW.organization_id AND p.employee_id=NEW.employee_id
    AND p.state IN ('planned','enroute')
    AND tstzrange(p.starts_at,p.ends_at,'[)') && tstzrange(NEW.starts_at,NEW.ends_at,'[)'))
 THEN RAISE EXCEPTION 'Overlapping crew travel order'; END IF;
 IF EXISTS(SELECT 1 FROM public.shadow_crew_assignments a
   JOIN public.shadow_flights f ON f.id=a.shadow_flight_id AND f.organization_id=a.organization_id
   WHERE a.employee_id=NEW.employee_id AND a.organization_id=NEW.organization_id
    AND f.id<>NEW.shadow_flight_id
    AND tstzrange(f.departure_at-interval '1 hour',f.arrival_at+interval '30 minutes','[)')
      && tstzrange(NEW.starts_at,NEW.report_at,'[)'))
 THEN RAISE EXCEPTION 'Crew travel conflicts with another assigned scenario'; END IF;
 v_from:=NEW.from_icao;
 FOR v_leg IN SELECT value FROM jsonb_array_elements(NEW.itinerary) LOOP
  v_count:=v_count+1;
  SELECT * INTO v_route FROM public.shadow_crew_travel_options r
   WHERE r.id=(v_leg->>'routeId')::uuid AND r.organization_id=NEW.organization_id
    AND r.simulation_only;
  IF NOT FOUND THEN RAISE EXCEPTION 'Travel option missing'; END IF;
  BEGIN
   v_depart:=(v_leg->>'startsAt')::timestamptz;
   v_arrive:=(v_leg->>'endsAt')::timestamptz;
  EXCEPTION WHEN others THEN
   RAISE EXCEPTION 'Invalid itinerary timestamps';
  END;
  IF v_depart IS NULL OR v_arrive IS NULL OR v_arrive<=v_depart
   OR v_route.from_icao<>v_from
   OR v_arrive-v_depart<>v_route.duration_minutes*interval '1 minute'
   OR v_count>1 AND (v_depart-v_last_arrival<>interval '45 minutes') THEN
    RAISE EXCEPTION 'Unreachable itinerary or broken connection';
  END IF;
  IF v_count=1 THEN v_first:=v_depart; END IF;
  v_last_arrival:=v_arrive;
  v_cost:=v_cost+v_route.estimated_cost_eur;
  v_from:=v_route.to_icao;
 END LOOP;
 IF v_count<1 OR v_first IS DISTINCT FROM NEW.starts_at
  OR v_last_arrival IS DISTINCT FROM NEW.ends_at
  OR v_from<>NEW.to_icao OR NEW.estimated_cost_eur<>v_cost THEN
  RAISE EXCEPTION 'Itinerary cost, origin or destination mismatch';
 END IF;
 -- All transfer reports must be at the correct place for either the charter
 -- itself or the preceding fictional aircraft ferry.
 IF EXISTS(
  SELECT 1 FROM public.shadow_positioning_legs l
  WHERE l.shadow_flight_id=NEW.shadow_flight_id AND l.organization_id=NEW.organization_id
   AND l.status IN ('planned','enroute')
 ) THEN
   IF NOT EXISTS(SELECT 1 FROM public.shadow_positioning_legs l
      WHERE l.shadow_flight_id=NEW.shadow_flight_id AND l.organization_id=NEW.organization_id
       AND l.from_icao=NEW.to_icao AND l.status IN ('planned','enroute')) THEN
     RAISE EXCEPTION 'Crew must report at the ferry origin';
   END IF;
 ELSIF NEW.to_icao<>v_flight.departure_icao THEN
   RAISE EXCEPTION 'Crew destination does not match charter reporting airport';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION ops_internal.validate_shadow_crew_transfer()
 FROM public,anon,authenticated;
CREATE TRIGGER shadow_crew_transfer_validate BEFORE INSERT
 ON public.shadow_crew_transfer_orders FOR EACH ROW
 EXECUTE FUNCTION ops_internal.validate_shadow_crew_transfer();
CREATE FUNCTION ops_internal.record_shadow_crew_transfer_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 INSERT INTO public.shadow_crew_transfer_events(
 organization_id,transfer_id,event_type,event_at,narrative)
 VALUES(NEW.organization_id,NEW.id,'planned',NEW.created_at,
 'Owner-approved fictional itinerary; no actual travel ticket reserved.');
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION ops_internal.record_shadow_crew_transfer_created()
 FROM public,anon,authenticated;
CREATE TRIGGER shadow_crew_transfer_created AFTER INSERT
 ON public.shadow_crew_transfer_orders FOR EACH ROW
 EXECUTE FUNCTION ops_internal.record_shadow_crew_transfer_created();

CREATE FUNCTION ops_internal.advance_shadow_crew_transfers(p_at timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
 r record; v_place text; v_time timestamptz; v_valid boolean; v_status text;
 n_arrived integer:=0; n_departed integer:=0; n_blocked integer:=0;
BEGIN
 IF p_at IS NULL THEN RAISE EXCEPTION 'Simulation time required'; END IF;
 PERFORM pg_advisory_xact_lock(505,9177);
 FOR r IN SELECT * FROM public.shadow_crew_transfer_orders
  WHERE state IN ('planned','enroute') AND starts_at<=p_at
  ORDER BY starts_at,id FOR UPDATE
 LOOP
  IF r.state='planned' THEN
   -- Before transferring anyone, inspect most recent synthetic flight/ground
   -- arrival or explicit owner-attested starting location.
   SELECT s.place,s.event_at,s.valid INTO v_place,v_time,v_valid FROM (
    SELECT m.to_icao AS place,m.arrived_at AS event_at,
     (m.status='completed_virtual') AS valid
    FROM public.shadow_crew_movements m WHERE m.organization_id=r.organization_id
     AND m.employee_id=r.employee_id AND m.arrived_at<=r.starts_at
    UNION ALL
    SELECT e.location_icao,e.occurred_at,true
    FROM public.crew_location_events e WHERE e.organization_id=r.organization_id
     AND e.employee_id=r.employee_id AND e.event_type='check_in'
     AND e.verification_state='verified'
     AND e.source_reference='owner_manual_initial_checkin'
     AND e.occurred_at<=r.starts_at
   ) s ORDER BY s.event_at DESC LIMIT 1;
   IF v_place IS NULL OR v_valid IS DISTINCT FROM true THEN v_status:='blocked_location';
   ELSIF v_place<>r.from_icao THEN v_status:='blocked_location';
   ELSIF v_time>r.starts_at-interval '10 minutes'
    OR v_time<r.starts_at-interval '7 days' THEN v_status:='blocked_time';
   ELSE v_status:='enroute'; END IF;
   IF v_status<>'enroute' THEN
    UPDATE public.shadow_crew_transfer_orders SET state=v_status,
     state_reason='Virtual crew location or transfer readiness unverified',
     updated_at=p_at WHERE id=r.id;
    INSERT INTO public.shadow_crew_transfer_events(
     organization_id,transfer_id,event_type,event_at,narrative)
     VALUES(r.organization_id,r.id,v_status,p_at,
      'Fictional crew travel blocked: no valid position or readiness.');
    n_blocked:=n_blocked+1;
    CONTINUE;
   END IF;
   UPDATE public.shadow_crew_transfer_orders SET state='enroute',
    updated_at=p_at WHERE id=r.id;
   INSERT INTO public.shadow_crew_transfer_events
    (organization_id,transfer_id,event_type,event_at,narrative)
    VALUES(r.organization_id,r.id,'departed',r.starts_at,'Synthetic travel commenced, no real ticket.');
   n_departed:=n_departed+1;
  END IF;
  IF r.ends_at<=p_at THEN
   -- A successful synthetic ground travel adds a shadow movement, not actual
   -- crew_location_events, and an expense without touching cash.
   INSERT INTO public.shadow_crew_movements (
     organization_id,assignment_id,employee_id,source_kind,source_id,
     from_icao,to_icao,departed_at,arrived_at,status,reason
   ) VALUES (
     r.organization_id,r.assignment_id,r.employee_id,'ground',r.id,
     r.from_icao,r.to_icao,r.starts_at,r.ends_at,'completed_virtual',
     'Simulated crew travel completed from owner-curated travel assumptions.')
   ON CONFLICT (organization_id,source_kind,source_id,employee_id) DO NOTHING;
   INSERT INTO public.shadow_crew_travel_expenses
    (organization_id,transfer_id,amount_eur)
    VALUES(r.organization_id,r.id,r.estimated_cost_eur)
   ON CONFLICT (transfer_id) DO NOTHING;
   UPDATE public.shadow_crew_transfer_orders SET state='completed_virtual',
    state_reason='Simulated travel completed; no real ticket or cash transaction',
    updated_at=p_at WHERE id=r.id;
   INSERT INTO public.shadow_crew_transfer_events(
    organization_id,transfer_id,event_type,event_at,narrative)
    VALUES(r.organization_id,r.id,'arrived',r.ends_at,
     'Fictional crew arrived at assigned report airport.');
   n_arrived:=n_arrived+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('started',n_departed,'arrived',n_arrived,
  'blocked',n_blocked,'simulation_only',true,'cash_movement',false);
END $fn$;
REVOKE ALL ON FUNCTION ops_internal.advance_shadow_crew_transfers(timestamptz)
 FROM public,anon,authenticated;
SELECT cron.schedule('aervelys-ops5-shadow-crew-travel-5min','*/5 * * * *',
 'select ops_internal.advance_shadow_crew_transfers(now());');

COMMENT ON TABLE public.shadow_crew_transfer_orders IS
 'Fictional owner-approved crew itinerary; worker auto-advances but does not make actual reservations.';
COMMENT ON TABLE public.shadow_crew_travel_expenses IS
 'Hypothetical cost posting only, not ledger cash or realized payment.';
