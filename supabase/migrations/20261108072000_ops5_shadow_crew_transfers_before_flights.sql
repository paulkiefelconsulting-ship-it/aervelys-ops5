-- Ensure virtual crew transfer arrivals are processed BEFORE the hourly
-- simulated aircraft ferry and charter outcomes, including catch-up ticks.
-- Version guarded: do not silently rewrite an unknown flight worker.
DO $patch$
DECLARE v_sql text;
BEGIN
 SELECT pg_get_functiondef('ops_internal.advance_shadow_flights(timestamptz)'::regprocedure)
 INTO v_sql;
 IF position('perform ops_internal.advance_shadow_positioning(p_at);' IN v_sql)=0 THEN
  RAISE EXCEPTION 'Unknown shadow flight worker version: missing positioning call';
 END IF;
 IF position('perform ops_internal.advance_shadow_crew_transfers(p_at);' IN v_sql)>0 THEN
  RAISE EXCEPTION 'Shadow crew transfer integration already applied';
 END IF;
 v_sql:=replace(v_sql,
 'perform ops_internal.advance_shadow_positioning(p_at);',
 'perform ops_internal.advance_shadow_crew_transfers(p_at);' || chr(10) ||
 '  perform ops_internal.advance_shadow_positioning(p_at);');
 EXECUTE v_sql;
END $patch$;
REVOKE ALL ON FUNCTION ops_internal.advance_shadow_flights(timestamptz)
 FROM public,anon,authenticated;
