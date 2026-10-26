-- Correct the PL/pgSQL table-alias shadowing in the state initialization.
-- The flight state variable named "a" must not shadow the seed SELECT's alias.
do $patch$
declare
 definition text;
 target text := E'select a.id,a.organization_id,a.registration,a.home_base_icao\n from public.aircraft a\n on conflict(aircraft_id) do nothing;';
 replacement text := E'select seed.id,seed.organization_id,seed.registration,seed.home_base_icao\n from public.aircraft seed\n on conflict(aircraft_id) do nothing;';
begin
 select pg_get_functiondef('ops_internal.advance_shadow_flights(timestamptz)'::regprocedure)
 into definition;
 if position(target in definition)=0 then
  raise exception 'Expected shadow aircraft initialization missing from function';
 end if;
 execute replace(definition,target,replacement);
end $patch$;
