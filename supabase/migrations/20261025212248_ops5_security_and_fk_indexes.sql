-- Security and index hardening for isolated AERVELYS OPS 5.0.
alter extension btree_gist set schema extensions;
create index organizations_owner_user_idx on public.organizations(owner_user_id);
create index reservations_aircraft_org_idx on public.resource_reservations(aircraft_id, organization_id);