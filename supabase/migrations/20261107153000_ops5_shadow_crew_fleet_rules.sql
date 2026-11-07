-- AERVELYS: enforce permanent fleet rules also in fictional PIC/SIC manifests.
-- Does not modify historic simulated charter requests or operational aircraft.
create function ops_internal.enforce_shadow_crew_fleet_rules()
returns trigger language plpgsql security definer set search_path=pg_catalog as $body$
declare
 v_type text;
 v_from text;
 v_to text;
begin
 select a.aircraft_type,f.departure_icao,f.arrival_icao
 into v_type,v_from,v_to
 from public.shadow_flights f
 join public.aircraft a on a.id=f.aircraft_id and a.organization_id=f.organization_id
 where f.id=new.shadow_flight_id and f.organization_id=new.organization_id;
 if not found then raise exception 'unknown scenario aircraft'; end if;
 if lower(v_type) like '%longitude%' and (
  v_from='EDAZ' or v_to='EDAZ'
  or exists(
    select 1 from public.shadow_positioning_legs leg
    where leg.shadow_flight_id=new.shadow_flight_id and leg.organization_id=new.organization_id
     and (leg.from_icao='EDAZ' or leg.to_icao='EDAZ')
  )
 ) then
  raise exception 'Citation Longitude D-BLNG cannot use EDAZ, including fictional ferry flights';
 end if;
 if lower(v_type) like '%phenom 300e%' then
  raise exception 'Phenom 300E is not released for charter scenarios';
 end if;
 return new;
end $body$;
revoke all on function ops_internal.enforce_shadow_crew_fleet_rules()
 from public,anon,authenticated;
create trigger shadow_crew_fleet_rules
 before insert on public.shadow_crew_assignments for each row
 execute function ops_internal.enforce_shadow_crew_fleet_rules();
