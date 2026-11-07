-- OPS 5.0: one-time virtual initial pilot location attestation by organization owner.
-- Existing ledger remains append-only; flight/transfer arrivals remain service-only.
-- This migration does NOT seed any crew location.
alter table public.crew_location_events
 add column recorded_by_user_id uuid references auth.users(id);

create unique index crew_location_one_verified_initial_checkin
 on public.crew_location_events(organization_id,employee_id)
 where event_type='check_in' and verification_state='verified';

revoke all on public.crew_location_events from anon;
grant select, insert on public.crew_location_events to authenticated;

create policy crew_location_owner_initial_checkin
 on public.crew_location_events for insert to authenticated
 with check (
   recorded_by_user_id = (select auth.uid())
   and event_type = 'check_in'
   and origin_icao is null
   and departed_at is null
   and verification_state = 'verified'
   and source_reference = 'owner_manual_initial_checkin'
   and verified_at is not null
   and occurred_at >= now() - interval '5 minutes'
   and occurred_at <= now() + interval '1 minute'
   and verified_at >= occurred_at
   and verified_at <= now() + interval '1 minute'
   and exists (
     select 1 from public.organizations o
     where o.id=organization_id and o.owner_user_id=(select auth.uid())
   )
   and exists (
     select 1 from public.employees e
     where e.id=employee_id and e.organization_id=organization_id
       and e.crew_role in ('PIC','SIC')
   )
 );

comment on column public.crew_location_events.recorded_by_user_id is
 'Authenticated owner who attested the initial virtual crew location. Non-owner automated events use service-only ingestion.';
