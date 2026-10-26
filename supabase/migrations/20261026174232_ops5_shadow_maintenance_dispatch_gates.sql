-- Integrate shadow-only technical dispatch gates with hourly flight and ferry workers.
alter table public.shadow_flights drop constraint shadow_flights_status_check;
alter table public.shadow_flights add constraint shadow_flights_status_check
 check(status in('planned','in_air','completed','blocked_positioning','blocked_busy','blocked_maintenance'));
alter table public.shadow_flight_events drop constraint shadow_flight_events_event_type_check;
alter table public.shadow_flight_events add constraint shadow_flight_events_event_type_check
 check(event_type in('created','departed','arrived','blocked_positioning','blocked_busy','blocked_maintenance'));

alter table public.shadow_positioning_legs drop constraint shadow_positioning_legs_status_check;
alter table public.shadow_positioning_legs add constraint shadow_positioning_legs_status_check
 check(status in('planned','enroute','completed','blocked_route','blocked_time','blocked_busy','blocked_maintenance'));
alter table public.shadow_positioning_legs drop constraint shadow_positioning_legs_check1;
alter table public.shadow_positioning_legs add constraint shadow_positioning_legs_check1
 check ((status in ('planned','enroute','completed') and assumed_block_hours>0
 and proposed_departure_at is not null and proposed_arrival_at is not null
 and proposed_departure_at<proposed_arrival_at)
 or status in ('blocked_route','blocked_time','blocked_busy','blocked_maintenance'));
alter table public.shadow_positioning_events drop constraint shadow_positioning_events_event_type_check;
alter table public.shadow_positioning_events add constraint shadow_positioning_events_event_type_check
 check(event_type in('planned','departed','arrived','blocked_route','blocked_time','blocked_busy','blocked_maintenance'));

-- Tight version guards prevent silently patching a different flight engine.
do $patch$
declare f text;p text;
begin
 select pg_get_functiondef('ops_internal.advance_shadow_flights(timestamptz)'::regprocedure) into f;
 if position('perform ops_internal.advance_shadow_positioning(p_at);' in f)=0
  or position('elsif st.hypothetical_location_icao<>f.departure_icao then' in f)=0
  or position('return jsonb_build_object(''created'',v_created' in f)=0 then
  raise exception 'Flight engine source changed; refuse maintenance integration';
 end if;
 f:=replace(f,'perform ops_internal.advance_shadow_positioning(p_at);',
    'perform ops_internal.advance_shadow_maintenance(p_at);' ||chr(10)||
    ' perform ops_internal.advance_shadow_positioning(p_at);');
 f:=replace(f,
  'elsif st.hypothetical_location_icao<>f.departure_icao then',
  'elsif not ops_internal.shadow_maintenance_can_fly(f.aircraft_id,f.assumed_block_hours) then' ||chr(10)||
  '    v_status:=''blocked_maintenance'';'||chr(10)||
  '   elsif st.hypothetical_location_icao<>f.departure_icao then');
 f:=replace(f,
  'return jsonb_build_object(''created'',v_created',
  'perform ops_internal.advance_shadow_maintenance(p_at);' ||chr(10)||
   ' return jsonb_build_object(''created'',v_created');
 f:=replace(f,
  'case when v_status=''blocked_positioning'' then',
  'case when v_status=''blocked_maintenance'' then' ||chr(10)||
  '       ''Counterfactual flight blocked by invented maintenance interval.'' '||chr(10)||
  '      when v_status=''blocked_positioning'' then');
 execute f;

 select pg_get_functiondef('ops_internal.advance_shadow_positioning(timestamptz)'::regprocedure) into p;
 if position('if duration_hours is null then new_status:=''blocked_route'';' in p)=0
  or position('if leg.status=''planned'' then' in p)=0 then
  raise exception 'Positioning worker source changed; refuse integration';
 end if;
 p:=replace(p,
  'if duration_hours is null then new_status:=''blocked_route'';',
  'if duration_hours is null then new_status:=''blocked_route'';'||chr(10)||
  '  elsif not ops_internal.shadow_maintenance_can_fly(flight.aircraft_id,duration_hours) then new_status:=''blocked_maintenance'';');
 p:=replace(p,
  'when ''blocked_time'' then ''Insufficient time for virtual positioning and turnaround.''',
  'when ''blocked_time'' then ''Insufficient time for virtual positioning and turnaround.'''||chr(10)||
  '     when ''blocked_maintenance'' then ''Fictional aircraft maintenance interval prevents the ferry.''');
 p:=replace(p,
  'if leg.status=''planned'' then',
  'if leg.status=''planned'' then'||chr(10)||
  '   if not ops_internal.shadow_maintenance_can_fly(leg.aircraft_id,leg.assumed_block_hours) then'||chr(10)||
  '     update public.shadow_positioning_legs set status=''blocked_maintenance'','||chr(10)||
  '      reason=''Virtual maintenance restriction at departure'',updated_at=p_at where id=leg.id;'||chr(10)||
  '     insert into public.shadow_positioning_events(organization_id,leg_id,event_type,event_at,narrative)'||chr(10)||
  '      values(leg.organization_id,leg.id,''blocked_maintenance'',p_at,'||chr(10)||
  '       ''Counterfactual ferry cancelled due to maintenance restriction.'');'||chr(10)||
  '     n_blocked:=n_blocked+1;continue;'||chr(10)||
  '   end if;');
 execute p;
end $patch$;
revoke all on function ops_internal.advance_shadow_flights(timestamptz) from public,anon,authenticated;
revoke all on function ops_internal.advance_shadow_positioning(timestamptz) from public,anon,authenticated;
