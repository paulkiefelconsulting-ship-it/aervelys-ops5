-- AERVELYS OPS5: owner-only append-only *simulation* crew roster drafts.
-- No changes to operational crew_duty_blocks or shadow_flights.
CREATE TABLE public.sim_crew_roster_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 series_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 1000),
 event_type text NOT NULL CHECK(event_type IN ('created','revised','cancelled')),
 employee_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('standby','training','office','rest','absence')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 note text NOT NULL DEFAULT '' CHECK(length(note)<=400),
 created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only),
 staff_notified boolean NOT NULL DEFAULT false CHECK(NOT staff_notified),
 operational_release boolean NOT NULL DEFAULT false CHECK(NOT operational_release),
 UNIQUE(organization_id,series_id,revision),
 FOREIGN KEY(employee_id,organization_id) REFERENCES public.employees(id,organization_id),
 CHECK(starts_at<ends_at)
);
CREATE INDEX sim_crew_roster_org_window_idx
 ON public.sim_crew_roster_revisions(organization_id,starts_at,ends_at);
CREATE INDEX sim_crew_roster_series_idx
 ON public.sim_crew_roster_revisions(organization_id,series_id,revision DESC);

ALTER TABLE public.sim_crew_roster_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sim_crew_roster_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.sim_crew_roster_revisions TO authenticated;
CREATE POLICY sim_crew_roster_owner_read ON public.sim_crew_roster_revisions
 FOR SELECT TO authenticated USING(
  EXISTS (SELECT 1 FROM public.organizations o WHERE
   o.id=organization_id AND o.owner_user_id=(SELECT auth.uid()))
 );
CREATE POLICY sim_crew_roster_owner_create ON public.sim_crew_roster_revisions
 FOR INSERT TO authenticated WITH CHECK(
  created_by_user_id=(SELECT auth.uid()) AND simulation_only=true
  AND NOT staff_notified AND NOT operational_release
  AND EXISTS(SELECT 1 FROM public.organizations o WHERE
   o.id=organization_id AND o.owner_user_id=(SELECT auth.uid()))
 );

CREATE FUNCTION ops_internal.validate_sim_crew_roster_revision()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
 v_previous record;
 v_staff record;
BEGIN
 IF (SELECT auth.uid()) IS DISTINCT FROM NEW.created_by_user_id OR
  NOT EXISTS(SELECT 1 FROM public.organizations o WHERE
   o.id=NEW.organization_id AND o.owner_user_id=(SELECT auth.uid()))
 THEN RAISE EXCEPTION 'Owner required for simulated roster draft'; END IF;
 IF NEW.simulation_only IS DISTINCT FROM true OR
  NEW.staff_notified IS DISTINCT FROM false OR
  NEW.operational_release IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Draft cannot notify employees or release a duty'; END IF;
 NEW.created_at:=now();

 -- Serialize one series, even if two app tabs submit a revision simultaneously.
 PERFORM pg_advisory_xact_lock(hashtext(NEW.organization_id::text),
  hashtext(NEW.series_id::text));
 SELECT r.* INTO v_previous FROM public.sim_crew_roster_revisions r
  WHERE r.organization_id=NEW.organization_id AND r.series_id=NEW.series_id
  ORDER BY r.revision DESC LIMIT 1;
 IF NOT FOUND THEN
  IF NEW.revision<>1 OR NEW.event_type<>'created' THEN
   RAISE EXCEPTION 'First revision must create a draft'; END IF;
 ELSE
  IF NEW.revision<>v_previous.revision+1 OR
   NEW.event_type NOT IN ('revised','cancelled') OR
   v_previous.event_type='cancelled' OR
   NEW.employee_id<>v_previous.employee_id THEN
   RAISE EXCEPTION 'Outdated, cancelled or conflicting roster revision';
  END IF;
 END IF;

 SELECT e.crew_role,e.employment_status INTO v_staff FROM public.employees e
  WHERE e.organization_id=NEW.organization_id AND e.id=NEW.employee_id
  FOR UPDATE;
 IF NOT FOUND OR v_staff.crew_role NOT IN ('PIC','SIC') OR
  v_staff.employment_status<>'active' THEN
  RAISE EXCEPTION 'Active PIC/SIC staff profile required'; END IF;

 IF NEW.event_type='cancelled' THEN
  IF NEW.starts_at IS DISTINCT FROM v_previous.starts_at OR
   NEW.ends_at IS DISTINCT FROM v_previous.ends_at OR
   NEW.kind IS DISTINCT FROM v_previous.kind THEN
   RAISE EXCEPTION 'Cancellation must keep prior roster snapshot'; END IF;
  RETURN NEW;
 END IF;

 IF NEW.starts_at<=now()+interval '10 minutes' OR
  NEW.starts_at>now()+interval '370 days' OR
  NEW.ends_at>NEW.starts_at+interval '24 hours' OR
  NEW.ends_at<=NEW.starts_at THEN
  RAISE EXCEPTION 'Only future draft shifts of at most 24h are allowed'; END IF;

 -- A saved draft must never silently overlap another currently active draft.
 IF EXISTS(
  SELECT 1 FROM (
   SELECT DISTINCT ON (r.series_id) r.series_id,r.event_type,r.starts_at,r.ends_at
   FROM public.sim_crew_roster_revisions r
   WHERE r.organization_id=NEW.organization_id AND r.employee_id=NEW.employee_id
    AND r.series_id<>NEW.series_id
   ORDER BY r.series_id,r.revision DESC
  ) latest WHERE latest.event_type<>'cancelled'
   AND tstzrange(latest.starts_at,latest.ends_at,'[)') &&
       tstzrange(NEW.starts_at,NEW.ends_at,'[)')
 ) THEN RAISE EXCEPTION 'Draft collides with another open draft'; END IF;

 IF EXISTS(SELECT 1 FROM public.crew_duty_blocks d WHERE
  d.organization_id=NEW.organization_id AND d.employee_id=NEW.employee_id
  AND d.state IN ('draft','confirmed','operational_lock')
  AND tstzrange(d.starts_at,d.ends_at,'[)') &&
      tstzrange(NEW.starts_at,NEW.ends_at,'[)')
 ) THEN RAISE EXCEPTION 'Draft overlaps an existing duty or absence'; END IF;
 IF EXISTS(SELECT 1 FROM public.shadow_crew_assignments a
  JOIN public.shadow_flights f ON f.id=a.shadow_flight_id
   AND f.organization_id=a.organization_id
  WHERE a.organization_id=NEW.organization_id AND a.employee_id=NEW.employee_id
   AND f.status IN ('planned','enroute')
   AND tstzrange(f.departure_at-interval '1 hour',
    f.arrival_at+interval '30 minutes','[)') &&
    tstzrange(NEW.starts_at,NEW.ends_at,'[)')
 ) THEN RAISE EXCEPTION 'Draft overlaps an assigned virtual flight'; END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION ops_internal.validate_sim_crew_roster_revision()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sim_crew_roster_revision_before_insert
 BEFORE INSERT ON public.sim_crew_roster_revisions FOR EACH ROW
 EXECUTE FUNCTION ops_internal.validate_sim_crew_roster_revision();

CREATE FUNCTION ops_internal.forbid_sim_crew_roster_revision_mutation()
 RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
 RAISE EXCEPTION 'Roster revision history is append-only';
END $fn$;
REVOKE ALL ON FUNCTION ops_internal.forbid_sim_crew_roster_revision_mutation()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sim_crew_roster_no_edit BEFORE UPDATE OR DELETE
 ON public.sim_crew_roster_revisions FOR EACH ROW
 EXECUTE FUNCTION ops_internal.forbid_sim_crew_roster_revision_mutation();

COMMENT ON TABLE public.sim_crew_roster_revisions IS
 'Owner-only immutable fictional crew roster drafts. No staff notification, operating duty, real booking or EASA FTL authorization.';
