-- AERVELYS OPS 5.0: append-only, tenant-isolated crew-location evidence.
-- SOURCE-ONLY migration: apply after resuming and verifying the new OPS 5.0 database.
-- No backfill: home bases and virtual/shadow flights cannot establish a crew location.

create table public.crew_location_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 employee_id uuid not null,
 event_type text not null check (event_type in
   ('check_in','flight_arrival','transfer_arrival','location_unknown')),
 origin_icao text check (origin_icao is null or origin_icao ~ '^[A-Z0-9]{4}$'),
 location_icao text check (location_icao is null or location_icao ~ '^[A-Z0-9]{4}$'),
 departed_at timestamptz,
 occurred_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 verification_state text not null default 'pending'
  check (verification_state in ('pending','verified','rejected')),
 verified_at timestamptz,
 source_reference text not null check (char_length(trim(source_reference)) between 4 and 200),
 notes text check (notes is null or char_length(notes)<=1000),
 unique (id, organization_id),
 foreign key(employee_id, organization_id)
   references public.employees(id, organization_id),
 check (
   (event_type='location_unknown' and location_icao is null)
   or (event_type<>'location_unknown' and location_icao is not null)
 ),
 check (event_type not in ('flight_arrival','transfer_arrival') or
  (origin_icao is not null and departed_at is not null and departed_at<=occurred_at)),
 check (verification_state <> 'verified' or
  (verified_at is not null and verified_at>=occurred_at)),
 check (verified_at is null or verification_state='verified')
);
create index crew_location_evidence_recent_idx on public.crew_location_events
 (organization_id,employee_id,occurred_at desc,recorded_at desc);

alter table public.crew_location_events enable row level security;
revoke all on public.crew_location_events from public,anon,authenticated;
grant select on public.crew_location_events to authenticated;
-- Authoritative insert path is a future protected server process, never public clients.
grant select,insert on public.crew_location_events to service_role;

create policy crew_location_events_owner_read
 on public.crew_location_events for select to authenticated
 using (exists(
  select 1 from public.organizations o
   where o.id=organization_id and o.owner_user_id=(select auth.uid())
 ));

-- Immutable evidence. Corrections are new events, never altered history.
create function ops_internal.reject_crew_location_mutation()
 returns trigger
 language plpgsql
 set search_path=pg_catalog
 as $body$
 begin
  raise exception 'crew location evidence is append-only';
 end
 $body$;
revoke all on function ops_internal.reject_crew_location_mutation()
 from public,anon,authenticated;
create trigger crew_location_events_append_only
 before update or delete on public.crew_location_events
 for each row execute function ops_internal.reject_crew_location_mutation();

comment on table public.crew_location_events is
 'Immutable crew location evidence within virtual AERVELYS operations; no live real-world flight or airline authorization.';
