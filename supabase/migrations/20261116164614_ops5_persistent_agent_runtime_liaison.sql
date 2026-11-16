
-- AERVELYS: isolated, simulation-only agent case supervision.
-- Does NOT mutate or duplicate existing sales conversations, bookings or aircraft.
create table public.agent_runtime_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_sales_case_id uuid not null references public.sim_sales_cases(id) on delete cascade,
  agent_role text not null default 'ops_liaison' check (agent_role = 'ops_liaison'),
  state text not null default 'queued'
    check (state in ('queued','waiting_sales','awaiting_ops_evidence','closed_declined')),
  revision integer not null default 0 check (revision >= 0),
  observed_sales_stage text,
  next_run_at timestamptz not null default now(),
  last_decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_runtime_tasks_unique_case unique (organization_id, source_sales_case_id,agent_role),
  constraint agent_runtime_tasks_org_id_id unique (organization_id,id)
);
create index agent_runtime_tasks_due_idx on public.agent_runtime_tasks (next_run_at,id)
  where state in ('queued','waiting_sales','awaiting_ops_evidence');

create table public.agent_runtime_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null,
  sequence_no integer not null check(sequence_no>0),
  event_key text not null,
  actor text not null check(actor='agent.ops_liaison'),
  body text not null check(char_length(body)<=2000),
  simulation_only boolean not null default true check(simulation_only is true),
  external_delivery boolean not null default false check(external_delivery is false),
  occurred_at timestamptz not null default now(),
  constraint agent_runtime_events_unique_event unique(task_id,sequence_no),
  constraint agent_runtime_events_task_org_fk foreign key(organization_id,task_id)
    references public.agent_runtime_tasks (organization_id,id) on delete cascade
);
create index agent_runtime_events_recent_idx on public.agent_runtime_events (organization_id,occurred_at desc);

alter table public.agent_runtime_tasks enable row level security;
alter table public.agent_runtime_events enable row level security;

revoke all on public.agent_runtime_tasks,public.agent_runtime_events from PUBLIC, anon, authenticated;
grant select on public.agent_runtime_tasks, public.agent_runtime_events to authenticated;

create policy agent_runtime_tasks_owner_read on public.agent_runtime_tasks
  for select to authenticated
  using (exists (select 1 from public.organizations o
    where o.id=agent_runtime_tasks.organization_id and o.owner_user_id=(select auth.uid())));
create policy agent_runtime_events_owner_read on public.agent_runtime_events
  for select to authenticated
  using (exists (select 1 from public.organizations o
    where o.id=agent_runtime_events.organization_id and o.owner_user_id=(select auth.uid())));

create function ops_internal.advance_agent_runtime(p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = ''
as $body$
declare
  v_task record;
  v_created integer := 0;
  v_advanced integer := 0;
  v_state text;
  v_event text;
  v_body text;
  v_due timestamptz;
begin
  if p_at is null or p_at > now() + interval '1 minute'
    or p_at < now() - interval '1 day' then
    raise exception 'INVALID_AGENT_RUNTIME_CLOCK';
  end if;

  -- Import only internal synthetic sales cases. Never touch real customer records.
  insert into public.agent_runtime_tasks(organization_id,source_sales_case_id,agent_role)
  select s.organization_id,s.id,'ops_liaison'
  from public.sim_sales_cases s
  where s.simulation_only is true
    and s.contract_confirmed is false and s.flight_released is false
    and s.external_delivery is false
    and s.created_at <= p_at
  order by s.created_at,s.id limit 100
  on conflict (organization_id,source_sales_case_id,agent_role) do nothing;
  get diagnostics v_created = row_count;

  -- SKIP LOCKED + unique events means concurrent runs do not duplicate work.
  for v_task in
    select t.id,t.organization_id,t.state,t.revision,t.observed_sales_stage,
           s.stage as sales_stage
    from public.agent_runtime_tasks t
    join public.sim_sales_cases s
      on s.id=t.source_sales_case_id and s.organization_id=t.organization_id
    where t.next_run_at <= p_at
      and t.state in ('queued','waiting_sales','awaiting_ops_evidence')
      and s.simulation_only is true
      and s.contract_confirmed is false and s.flight_released is false
      and s.external_delivery is false
    order by t.next_run_at,t.id limit 100
    for update of t skip locked
  loop
    v_event := null;
    v_body := null;
    v_state := v_task.state;

    if v_task.sales_stage in ('declined','declined_pricing') then
      v_state := 'closed_declined';
      v_event := 'agent.case_closed_declined';
      v_body := 'Der simulierte Kunde hat abgelehnt. Der OPS-Agent schliesst die interne Pruefaufgabe.';
    elsif v_task.sales_stage='interested_pending_ops' then
      if v_task.state <> 'awaiting_ops_evidence' then
        v_state := 'awaiting_ops_evidence';
        v_event := 'agent.ops_evidence_required';
        v_body := 'Kundeninteresse erkannt. Flugzeug-, Crew- und Betriebsfreigaben fehlen; keine Buchung.';
      end if;
    else
      if v_task.state <> 'waiting_sales' or
         v_task.observed_sales_stage is distinct from v_task.sales_stage then
        v_state := 'waiting_sales';
        v_event := 'agent.waiting_for_sales';
        v_body := 'Sales-Vorgang beobachtet; keine OPS-Freigabe oder Charterbuchung moeglich.';
      end if;
    end if;

    v_due := p_at + case when v_state='waiting_sales' then interval '15 minutes'
                          else interval '30 minutes' end;
    if v_event is not null then
      update public.agent_runtime_tasks
      set state=v_state,revision=revision+1,observed_sales_stage=v_task.sales_stage,
          last_decision_at=p_at,updated_at=p_at,next_run_at=v_due
      where id=v_task.id and revision=v_task.revision;
      if not found then raise exception 'AGENT_REVISION_CONFLICT'; end if;
      insert into public.agent_runtime_events(
        organization_id,task_id,sequence_no,event_key,actor,body,occurred_at)
      values (v_task.organization_id,v_task.id,v_task.revision+1,v_event,
        'agent.ops_liaison',v_body,p_at);
      v_advanced := v_advanced+1;
    else
      update public.agent_runtime_tasks
      set observed_sales_stage=v_task.sales_stage,next_run_at=v_due,updated_at=p_at
      where id=v_task.id;
    end if;
  end loop;

  return jsonb_build_object('tasks_created',v_created,'events_created',v_advanced,
    'simulation_only',true,'as_of',p_at);
end
$body$;

revoke all on function ops_internal.advance_agent_runtime(timestamptz) from PUBLIC,anon,authenticated;

do $schedule$
begin
  if not exists (select 1 from cron.job where jobname='aervelys-ops5-agent-liaison-10min') then
    perform cron.schedule('aervelys-ops5-agent-liaison-10min',
      '*/10 * * * *',
      'select ops_internal.advance_agent_runtime(now());');
  end if;
end
$schedule$;
