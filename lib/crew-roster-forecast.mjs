/**
 * AERVELYS OPS 5.0 – read-only multiweek crew roster projection.
 * A roster preview is never a duty assignment, standby order, EASA FTL
 * clearance, aircraft release, crew positioning or persisted availability.
 */
const DAY=86_400_000;
const MIN=60_000;
const REST=690; // 11h30 SIM review buffer; NOT a legal FTL calculation
const time=s=>typeof s==='string'&&s.trim()?Date.parse(s):NaN;
const isoDay=t=>new Date(t).toISOString().slice(0,10);
const role=x=>['PIC','SIC'].includes(x);
const intersects=(a,b)=>a.start<b.end&&b.start<a.end;
const confirmed=x=>['confirmed','active','operational','locked'].includes(x);
const passive=x=>['leave','rest','vacation','absence','sick'].includes(String(x).toLowerCase());
const eventWorking=x=>!passive(x.kind);
const timeWindow=(start,end)=>Number.isFinite(start)&&Number.isFinite(end)&&end>start;

/**
 * Input is data already filtered by a verified owner / organization workspace.
 * On inaccessible or truncated data, nothing is inferred to be free or callable.
 */
export function buildCrewRosterForecast({
 startDate,weeks=4,people=[],dutyBlocks=[],shadowFlights=[],
 shadowAssignments=[],draftSlots=[],asOf=new Date().toISOString(),dataComplete=true
}={}){
 const start=time(startDate+'T00:00:00Z');
 const now=time(asOf);
 if(![2,4,8,12].includes(weeks)||!/^\d{4}-\d{2}-\d{2}$/.test(startDate??'')||
  !Number.isFinite(start)||isoDay(start)!==startDate||!Number.isFinite(now))
  throw new TypeError('Invalid roster date, horizon or current time');
 const end=start+weeks*7*DAY;
 if(dataComplete!==true)return {status:'unavailable',reason:'SOURCE_INCOMPLETE',
  startDate,weeks,days:[],rows:[],standby:[],weeksSummary:[],totals:null};
 const pilots=[...people].filter(p=>role(p.role)).sort((a,b)=>
  String(a.name).localeCompare(String(b.name),'de')||String(a.id).localeCompare(String(b.id)));
 const byId=new Map(pilots.map(p=>[p.id,p]));
 const flightById=new Map(shadowFlights.map(f=>[f.id,f]));
 const events=new Map(pilots.map(p=>[p.id,[]]));
 let invalid=false;
 for(const b of dutyBlocks){
  if(!byId.has(b.employeeId))continue;
  const a=time(b.startsAt),z=time(b.endsAt);
  if(!timeWindow(a,z)){invalid=true;continue;}
  if(a>=end||z<=start)continue;
  events.get(b.employeeId).push({
   id:'duty:'+b.id,source:'roster',kind:String(b.kind||'unknown').toLowerCase(),
   start:a,end:z,state:confirmed(b.state)?'recorded':'draft',
   label:String(b.kind||'Dienst')});
 }
 // Isolated versioned simulation drafts: visible in the calendar, never promoted
 // into operational crew_duty_blocks or treated as a confirmed duty.
 for(const d of draftSlots){
  const employee=byId.get(d.employeeId);
  const a=time(d.startsAt),z=time(d.endsAt);
  if(!employee||!timeWindow(a,z)||
   !['standby','training','office','rest','absence'].includes(d.kind)){
   invalid=true;continue;
  }
  if(a>=end||z<=start)continue;
  events.get(employee.id).push({id:'draft:'+d.id,source:'sim_draft',
   kind:d.kind,start:a,end:z,state:'draft',label:'SIM-Entwurf '+d.kind});
 }
 for(const a of shadowAssignments){
  if(!byId.has(a.employeeId)){invalid=true;continue;}
  const f=flightById.get(a.shadowFlightId);
  if(!f||a.role!==byId.get(a.employeeId).role){invalid=true;continue;}
  if(!['planned','enroute'].includes(f.status))continue;
  const depart=time(f.departureAt),arrive=time(f.arrivalAt);
  if(!timeWindow(depart,arrive)){invalid=true;continue;}
  const begins=depart-60*MIN,finishes=arrive+30*MIN;
  if(begins>=end||finishes<=start)continue;
  events.get(a.employeeId).push({
   id:'shadow:'+a.shadowFlightId+':'+a.employeeId,
   source:'shadow',kind:'flight',start:begins,end:finishes,
   state:'scenario',label:String(f.departureIcao)+' → '+String(f.arrivalIcao)});
 }
 if(invalid)return {status:'unavailable',reason:'INVALID_OR_ORPHANED_SCHEDULE',
  startDate,weeks,days:[],rows:[],standby:[],weeksSummary:[],totals:null};
 const dateRanges=Array.from({length:weeks*7},(_,i)=>{
  const from=start+i*DAY;
  return {date:isoDay(from),start:from,end:from+DAY};
 });
 let conflictCount=0;
 const rows=pilots.map(p=>{
  const all=events.get(p.id).sort((a,b)=>a.start-b.start||a.end-b.end||a.id.localeCompare(b.id));
  const problems=new Set();
  for(let i=1;i<all.length;i++){
   const earlier=all[i-1],later=all[i];
   if(intersects(earlier,later)){
    problems.add(later.id);
    problems.add(earlier.id);
   }else if(eventWorking(earlier)&&eventWorking(later)&&
    later.start-earlier.end<REST*MIN){
    problems.add(later.id);
   }
  }
  const days=dateRanges.map(d=>{
   const active=all.filter(e=>intersects(e,d));
   const problem=active.some(e=>problems.has(e.id));
   if(problem)conflictCount++;
   const kind=problem?'conflict':
    active.some(e=>e.source==='sim_draft')?'draft':
    active.some(e=>passive(e.kind))?'absence':
    active.some(e=>e.source==='roster'&&e.state==='recorded')?'recorded':
    active.some(e=>e.source==='shadow')?'shadow':
    active.length?'draft':'unplanned';
   return {date:d.date,kind,events:active.map(e=>({
    id:e.id,kind:e.kind,state:e.state,label:e.label,
    startsAt:new Date(e.start).toISOString(),endsAt:new Date(e.end).toISOString()
   })),standbyCandidate:false};
  });
  return {employeeId:p.id,name:p.name,role:p.role,employmentStatus:p.employmentStatus,
   days,recordedDays:days.filter(d=>d.kind==='recorded').length,
   shadowDays:days.filter(d=>d.kind==='shadow').length,
   conflictDays:days.filter(d=>d.kind==='conflict').length};
 });
 const assignedCount=new Map(pilots.map(p=>[p.id,0]));
 const standby=[];
 const slots=[];
 for(const d of dateRanges){
  const proposal={date:d.date,PIC:null,SIC:null,qualificationStatus:'UNVERIFIED'};
  const shiftStart=d.start+8*60*MIN,shiftEnd=d.start+20*60*MIN;
  for(const seat of ['PIC','SIC']){
   const options=pilots.filter(p=>p.role===seat&&p.employmentStatus==='active'&&
    // Neither shift nor its conservative rest buffer can intersect any known
    // duty, absence, drafted roster entry or persisted shadow assignment.
    !(events.get(p.id)||[]).some(e=>intersects(e,{start:shiftStart-REST*MIN,end:shiftEnd+REST*MIN}))&&
    !slots.some(s=>s.employeeId===p.id&&intersects(
     {start:shiftStart-REST*MIN,end:shiftEnd+REST*MIN},
     {start:s.startsAt,end:s.endsAt})));
   options.sort((a,b)=>assignedCount.get(a.id)-assignedCount.get(b.id)||
    String(a.id).localeCompare(String(b.id)));
   const chosen=options[0];
   if(chosen&&shiftStart>now){
    proposal[seat]={employeeId:chosen.id,name:chosen.name,
     startsAt:new Date(shiftStart).toISOString(),endsAt:new Date(shiftEnd).toISOString()};
    slots.push({employeeId:chosen.id,startsAt:shiftStart,endsAt:shiftEnd});
    assignedCount.set(chosen.id,assignedCount.get(chosen.id)+1);
    rows.find(r=>r.employeeId===chosen.id).days.find(x=>x.date===d.date).standbyCandidate=true;
   }
  }
  standby.push(proposal);
 }
 const weeksSummary=Array.from({length:weeks},(_,i)=>{
  const interval=dateRanges.slice(i*7,i*7+7);
  const covered=rows.flatMap(r=>r.days.slice(i*7,i*7+7));
  const slotsWeek=standby.slice(i*7,i*7+7);
  return {index:i,startDate:interval[0].date,endDate:interval[6].date,
   recordedDays:covered.filter(d=>d.kind==='recorded').length,
   shadowDays:covered.filter(d=>d.kind==='shadow').length,
   conflictDays:covered.filter(d=>d.kind==='conflict').length,
   standbyPicIdeas:slotsWeek.filter(d=>d.PIC!==null).length,
   standbySicIdeas:slotsWeek.filter(d=>d.SIC!==null).length};
 });
 return {status:'preview',reason:null,startDate,weeks,days:dateRanges.map(x=>x.date),
  rows,standby,weeksSummary,
  totals:{pilots:pilots.length,conflictDays:conflictCount,
   unplannedDays:rows.reduce((n,r)=>n+r.days.filter(d=>d.kind==='unplanned').length,0),
   standbyIdeas:slots.length,flightApprovals:0,verifiedTypeRatings:0}};
}
