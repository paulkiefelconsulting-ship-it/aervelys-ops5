-- AERVELYS: autonomous, fictional, 12-week crew standby cycle.
-- No writes to employees, crew_duty_blocks, shadow_crew_assignments,
-- real-world notifications, finances or operating flight release.
CREATE TABLE public.sim_crew_auto_roster (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 duty_day date NOT NULL,
 crew_role text NOT NULL CHECK(crew_role IN ('PIC','SIC')),
 employee_id uuid,
 profile_status text NOT NULL CHECK(profile_status IN ('active','draft','unfilled')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('scheduled_virtual','unfilled')),
 qualification_status text NOT NULL DEFAULT 'UNVERIFIED_SIMULATION_ONLY'
  CHECK(qualification_status='UNVERIFIED_SIMULATION_ONLY'),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only),
 operational_release boolean NOT NULL DEFAULT false CHECK(NOT operational_release),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,duty_day,crew_role),
 FOREIGN KEY(employee_id,organization_id) REFERENCES public.employees(id,organization_id),
 CHECK(starts_at<ends_at),
 CHECK(
  (status='scheduled_virtual' AND employee_id IS NOT NULL AND profile_status IN ('active','draft'))
  OR(status='unfilled' AND employee_id IS NULL AND profile_status='unfilled')
 )
);
CREATE INDEX sim_crew_auto_roster_staff_idx
 ON public.sim_crew_auto_roster(organization_id,employee_id,starts_at);

ALTER TABLE public.sim_crew_auto_roster ADD CONSTRAINT sim_crew_auto_roster_org_id_key
 UNIQUE(id,organization_id);

CREATE TABLE public.sim_crew_auto_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 roster_id uuid NOT NULL,
 employee_id uuid NOT NULL,
 message_type text NOT NULL DEFAULT 'virtual_standby_schedule'
  CHECK(message_type='virtual_standby_schedule'),
 subject text NOT NULL CHECK(char_length(subject) BETWEEN 3 AND 160),
 body text NOT NULL CHECK(char_length(body) BETWEEN 3 AND 1000),
 delivery_status text NOT NULL DEFAULT 'delivered_in_simulation'
  CHECK(delivery_status='delivered_in_simulation'),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only),
 external_delivery boolean NOT NULL DEFAULT false CHECK(NOT external_delivery),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(roster_id,message_type),
 FOREIGN KEY(roster_id,organization_id) REFERENCES public.sim_crew_auto_roster(id,organization_id),
 FOREIGN KEY(employee_id,organization_id) REFERENCES public.employees(id,organization_id)
);

CREATE TABLE public.sim_crew_auto_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 run_day date NOT NULL,
 horizon_days integer NOT NULL CHECK(horizon_days=84),
 new_slots integer NOT NULL CHECK(new_slots>=0),
 unfilled_slots integer NOT NULL CHECK(unfilled_slots>=0),
 run_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'completed_virtual' CHECK(status='completed_virtual'),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only),
 UNIQUE(organization_id,run_day)
);

DO $permissions$ DECLARE v_table text; BEGIN
 FOREACH v_table IN ARRAY ARRAY[
  'sim_crew_auto_roster','sim_crew_auto_messages','sim_crew_auto_runs'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',v_table);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',v_table);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
   USING(EXISTS(SELECT 1 FROM public.organizations o
    WHERE o.id=organization_id AND o.owner_user_id=(SELECT auth.uid())))',
   v_table||'_owner_read',v_table);
 END LOOP;
END $permissions$;

-- Private engine, invoked only by pg_cron. All result rows explicitly fictional.
CREATE FUNCTION ops_internal.generate_autonomous_crew_roster(
 p_day date DEFAULT (now() AT TIME ZONE 'UTC')::date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE
 v_org record;
 v_date date;
 v_role text;
 v_start timestamptz;
 v_end timestamptz;
 v_person uuid;
 v_staff_status text;
 v_inserted record;
 v_written integer;
 v_created integer;
 v_unfilled integer;
 v_total integer:=0;
 v_total_unfilled integer:=0;
BEGIN
 IF p_day IS NULL OR p_day<date '2026-01-01' OR
  p_day>(now() AT TIME ZONE 'UTC')::date+interval '370 days' THEN
  RAISE EXCEPTION 'Invalid autonomous roster cycle';
 END IF;
 FOR v_org IN SELECT id FROM public.organizations ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(
   hashtext('aervelys_autonomous_roster'),hashtext(v_org.id::text));
  v_created:=0;
  v_unfilled:=0;
  FOR v_date IN SELECT generate_series(p_day+1,p_day+84,interval '1 day')::date LOOP
   v_start := (v_date::timestamp AT TIME ZONE 'UTC')+interval '8 hours';
   v_end   := (v_date::timestamp AT TIME ZONE 'UTC')+interval '20 hours';
   FOREACH v_role IN ARRAY ARRAY['PIC','SIC'] LOOP
    -- Existing allocations are immutable; repeated jobs cannot double-create.
    IF EXISTS(SELECT 1 FROM public.sim_crew_auto_roster s
      WHERE s.organization_id=v_org.id AND s.duty_day=v_date AND s.crew_role=v_role)
    THEN CONTINUE; END IF;
    v_person:=NULL;
    v_staff_status:='unfilled';
    SELECT e.id,e.employment_status INTO v_person,v_staff_status
     FROM public.employees e
     WHERE e.organization_id=v_org.id AND e.crew_role=v_role
      AND e.employment_status IN ('active','draft')
      AND NOT EXISTS(
       SELECT 1 FROM public.crew_duty_blocks d
       WHERE d.organization_id=v_org.id AND d.employee_id=e.id
        AND d.state IN ('draft','confirmed','operational_lock')
        AND tstzrange(d.starts_at,d.ends_at,'[)') &&
            tstzrange(v_start-interval '11 hours 30 minutes',
                      v_end+interval '11 hours 30 minutes','[)')
      )
      AND NOT EXISTS(
       SELECT 1 FROM public.shadow_crew_assignments a
       JOIN public.shadow_flights f ON f.id=a.shadow_flight_id
        AND f.organization_id=a.organization_id
       WHERE a.organization_id=v_org.id AND a.employee_id=e.id
        AND f.status IN ('planned','enroute')
        AND tstzrange(f.departure_at-interval '1 hour',
                      f.arrival_at+interval '30 minutes','[)') &&
            tstzrange(v_start-interval '11 hours 30 minutes',
                      v_end+interval '11 hours 30 minutes','[)')
      )
      AND NOT EXISTS(
       SELECT 1 FROM (
        SELECT DISTINCT ON (r.series_id) r.series_id,r.employee_id,r.event_type,
            r.starts_at,r.ends_at
        FROM public.sim_crew_roster_revisions r
        WHERE r.organization_id=v_org.id AND r.employee_id=e.id
        ORDER BY r.series_id,r.revision DESC
       ) latest WHERE latest.event_type<>'cancelled'
         AND tstzrange(latest.starts_at,latest.ends_at,'[)') &&
             tstzrange(v_start-interval '11 hours 30 minutes',
                       v_end+interval '11 hours 30 minutes','[)')
      )
      AND NOT EXISTS(
       SELECT 1 FROM public.sim_crew_auto_roster old
       WHERE old.organization_id=v_org.id AND old.employee_id=e.id
        AND old.status='scheduled_virtual'
        AND tstzrange(old.starts_at,old.ends_at,'[)') &&
          tstzrange(v_start-interval '11 hours 30 minutes',
                    v_end+interval '11 hours 30 minutes','[)')
      )
     ORDER BY CASE WHEN e.employment_status='active' THEN 0 ELSE 1 END,
      (SELECT count(*) FROM public.sim_crew_auto_roster slot
        WHERE slot.organization_id=v_org.id AND slot.employee_id=e.id
         AND slot.duty_day >= v_date-28
         AND slot.duty_day<v_date),
      e.id
     LIMIT 1;
    INSERT INTO public.sim_crew_auto_roster(
      organization_id,duty_day,crew_role,employee_id,profile_status,
      starts_at,ends_at,status
    ) VALUES(
      v_org.id,v_date,v_role,v_person,
      CASE WHEN v_person IS NULL THEN 'unfilled' ELSE v_staff_status END,
      v_start,v_end,
      CASE WHEN v_person IS NULL THEN 'unfilled' ELSE 'scheduled_virtual' END
    ) ON CONFLICT(organization_id,duty_day,crew_role) DO NOTHING
    RETURNING id,employee_id INTO v_inserted;
    GET DIAGNOSTICS v_written=ROW_COUNT;
    IF v_written=1 THEN
     v_created:=v_created+1;
     IF v_person IS NULL THEN
      v_unfilled:=v_unfilled+1;
     ELSE
      -- This is an autonomous in-game notification, never an email/SMS.
      INSERT INTO public.sim_crew_auto_messages(
       organization_id,roster_id,employee_id,subject,body
      ) VALUES(
       v_org.id,v_inserted.id,v_person,
       'AERVELYS: virtuelle Bereitschaft ' || v_date::text,
       'Automatisch im Rollenspiel eingeplant: ' || v_role || ' am ' || v_date::text ||
       ' von 08:00 bis 20:00 UTC. Keine reale Dienstanweisung, kein ' ||
       'nachgewiesenes Type Rating, kein echtes Ticket oder Flugfreigabe.'
      );
     END IF;
    END IF;
   END LOOP;
  END LOOP;
  INSERT INTO public.sim_crew_auto_runs(
    organization_id,run_day,horizon_days,new_slots,unfilled_slots
  ) VALUES(v_org.id,p_day,84,v_created,v_unfilled)
  ON CONFLICT(organization_id,run_day) DO UPDATE SET
   new_slots=public.sim_crew_auto_runs.new_slots+EXCLUDED.new_slots,
   unfilled_slots=public.sim_crew_auto_runs.unfilled_slots+EXCLUDED.unfilled_slots,
   run_at=now();
  v_total:=v_total+v_created;
  v_total_unfilled:=v_total_unfilled+v_unfilled;
 END LOOP;
 RETURN jsonb_build_object('simulation_only',true,'horizon_days',84,
  'generated_slots',v_total,'unfilled_slots',v_total_unfilled);
END $function$;
REVOKE ALL ON FUNCTION ops_internal.generate_autonomous_crew_roster(date)
 FROM PUBLIC,anon,authenticated;

-- Daily 05:45 UTC after fictional market, crew screening and fleet holding.
SELECT cron.schedule(
 'aervelys-ops5-autonomous-roster-daily',
 '45 5 * * *',
 'select ops_internal.generate_autonomous_crew_roster((now() at time zone ''UTC'')::date);'
);
