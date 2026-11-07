-- Crew travel assumptions for the isolated AERVELYS shadow-world.
-- Values are OWNER-DEFINED FICTIONAL SCENARIO INPUTS, NOT live availability,
-- bookings, certified travel times, actual tickets or operational FTL evidence.
create table public.shadow_crew_travel_options(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 from_icao text not null check(from_icao ~ '^[A-Z0-9]{4}$'),
 to_icao text not null check(to_icao ~ '^[A-Z0-9]{4}$'),
 mode text not null check(mode in ('shuttle','rail','airline')),
 duration_minutes integer not null check(duration_minutes between 5 and 4320),
 estimated_cost_eur numeric(12,2) not null check(estimated_cost_eur between 0 and 100000),
 scenario_note text not null check(char_length(trim(scenario_note)) between 3 and 400),
 created_by_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 simulation_only boolean not null default true check(simulation_only),
 check(from_icao<>to_icao),
 unique(organization_id,from_icao,to_icao,mode,duration_minutes,estimated_cost_eur),
 unique(id,organization_id)
);
create index shadow_crew_travel_options_from_to_idx
 on public.shadow_crew_travel_options(organization_id,from_icao,to_icao);

alter table public.shadow_crew_travel_options enable row level security;
revoke all on public.shadow_crew_travel_options from public,anon,authenticated;
grant select,insert on public.shadow_crew_travel_options to authenticated;
create policy shadow_crew_travel_owner_read
 on public.shadow_crew_travel_options for select to authenticated
 using (exists(select 1 from public.organizations o
  where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy shadow_crew_travel_owner_insert
 on public.shadow_crew_travel_options for insert to authenticated
 with check(
  simulation_only=true
  and created_by_user_id=(select auth.uid())
  and created_at between now()-interval '5 minutes' and now()+interval '1 minute'
  and exists(select 1 from public.organizations o
   where o.id=organization_id and o.owner_user_id=(select auth.uid()))
 );
create trigger shadow_crew_travel_immutable
 before update or delete on public.shadow_crew_travel_options
 for each row execute function ops_internal.prevent_sim_ledger_mutation();
comment on table public.shadow_crew_travel_options is
 'Append-only fictional itinerary assumptions for virtual Crew Mobility only. Not real transfers, ticket bookings, duty-hour compliance or an operational charter release.';
