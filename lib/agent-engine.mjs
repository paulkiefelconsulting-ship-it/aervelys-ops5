/**
 * AERVELYS Agent Engine v1: deterministic, independently operated agents.
 * No model API, network I/O, DB writes, bookings or financial postings.
 */
export const AGENT_ENGINE_VERSION='1.0.0';
const stages=new Set(['new','awaiting_model_price','indicative_quote','counter_offer','interested_pending_ops','declined','declined_pricing']);
const terminal=new Set(['interested_pending_ops','declined','declined_pricing']);
const round=n=>Math.round(n*100)/100;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const iso=value=>{
 const time=Date.parse(value??'');
 if(!Number.isFinite(time))throw new Error('INVALID_TIMESTAMP');
 return new Date(time).toISOString();
};
const later=(at,minutes)=>new Date(Date.parse(at)+minutes*60_000).toISOString();
const icao=value=>/^[A-Z]{4}$/.test(String(value??''))?value:null;

export function createCharterCase({id,request,customer,createdAt}){
 if(typeof id!=='string'||!id.trim())throw new Error('INVALID_CASE_ID');
 if(!request||!icao(request.from)||!icao(request.to)||request.from===request.to||
  !Number.isInteger(request.passengers)||request.passengers<1)throw new Error('INVALID_REQUEST');
 const date=iso(createdAt),departure=iso(request.departsAt);
 if(Date.parse(departure)<=Date.parse(date))throw new Error('DEPARTURE_NOT_IN_FUTURE');
 if(!customer||typeof customer.id!=='string'||!customer.id.trim()||
  !positive(customer.budgetEur))throw new Error('CUSTOMER_BUDGET_REQUIRED');
 const strategy=customer.strategy??'value';
 if(!['value','bargain','strict'].includes(strategy))throw new Error('INVALID_CUSTOMER_STRATEGY');
 return {
  id,status:'new',revision:0,createdAt:date,updatedAt:date,nextRunAt:date,
  request:{from:request.from,to:request.to,departsAt:departure,passengers:request.passengers},
  customer:{id:customer.id,displayName:String(customer.displayName??'Virtueller Kunde').slice(0,120),
   budgetEur:round(customer.budgetEur),strategy},
  pricing:null,counterOfferEur:null,messages:[]
 };
}

/**
 * One state-machine transition per call. Stable event IDs support retries.
 * Pricing must come from a separate pricing service; never invented here.
 */
export function advanceCharterCase(state,{now,pricing=null,minMargin=0.18}={}){
 if(!state||!stages.has(state.status)||!Number.isInteger(state.revision)||state.revision<0)
  throw new Error('INVALID_CASE_STATE');
 if(typeof minMargin!=='number'||!Number.isFinite(minMargin)||minMargin<0||minMargin>2)
  throw new Error('INVALID_MARGIN_POLICY');
 const at=iso(now);
 if(terminal.has(state.status)||Date.parse(at)<Date.parse(state.nextRunAt))
  return {case:state,events:[]};
 let nextStatus=state.status,speaker='system',eventType='',body='',nextRunAt=at;
 let nextPricing=state.pricing,counterOffer=state.counterOfferEur;
 const euro=n=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n);
 switch(state.status){
  case 'new':
   nextStatus='awaiting_model_price';speaker='customer';eventType='inquiry.received';
   body='Bitte erstellen Sie eine Preisindikation für '+state.request.passengers+
    ' Passagier(e) von '+state.request.from+' nach '+state.request.to+'.';
   break;
  case 'awaiting_model_price':{
   if(!pricing)return {case:state,events:[]};
   if(!positive(pricing.estimatedCostEur)||!positive(pricing.suggestedPriceEur))
    throw new Error('VERIFIED_PRICE_INPUT_REQUIRED');
   const floor=round(pricing.estimatedCostEur*(1+minMargin));
   const price=round(Math.max(pricing.suggestedPriceEur,floor));
   nextPricing={estimatedCostEur:round(pricing.estimatedCostEur),priceEur:price,
    floorEur:floor,basis:'simulation_estimate'};
   nextStatus='indicative_quote';speaker='sales';eventType='quote.indicative';
   body='Unverbindliche Preisindikation: '+euro(price)+
    '. Durchführung und Crew-/Flugzeugfreigabe stehen noch aus.';
   nextRunAt=later(at,15);
   break;
  }
  case 'indicative_quote':{
   if(!state.pricing||!positive(state.pricing.priceEur))
    throw new Error('MISSING_CASE_PRICE');
   const {priceEur}=state.pricing,budget=state.customer.budgetEur;
   speaker='customer';
   if(priceEur<=budget&&state.customer.strategy==='value'){
    nextStatus='interested_pending_ops';eventType='customer.interested';
    body='Die Preisindikation passt. Bitte prüfen Sie die operationelle Durchführbarkeit.';
   }else if(priceEur>budget*1.35||(state.customer.strategy==='strict'&&priceEur>budget)){
    nextStatus='declined';eventType='customer.declined';
    body='Die Preisindikation liegt außerhalb meines Budgets. Ich sage ab.';
   }else{
    counterOffer=round(Math.min(budget,priceEur*0.94));
    nextStatus='counter_offer';eventType='customer.counter_offer';
    body='Ich würde '+euro(counterOffer)+' anbieten. Ist das möglich?';
    nextRunAt=later(at,15);
   }
   break;
  }
  case 'counter_offer':{
   if(!state.pricing||!positive(state.counterOfferEur))throw new Error('MISSING_COUNTER_OFFER');
   speaker='sales';
   if(state.counterOfferEur>=state.pricing.floorEur){
    nextStatus='interested_pending_ops';eventType='sales.counter_accepted';
    body='Wir können die unverbindliche Preisindikation von '+
     euro(state.counterOfferEur)+' anbieten. Operations muss den Flug noch freigeben.';
   }else{
    nextStatus='declined_pricing';eventType='sales.counter_rejected';
    body='Das Gegenangebot liegt unter unserem kalkulierten Mindestpreis. Keine Buchung.';
   }
   break;
  }
  default:return {case:state,events:[]};
 }
 const revision=state.revision+1;
 const event={id:state.id+':'+revision,caseId:state.id,revision,
  occurredAt:at,speaker,eventType,body,simulated:true};
 const next={...state,status:nextStatus,revision,updatedAt:at,nextRunAt,
  pricing:nextPricing,counterOfferEur:counterOffer,messages:[...state.messages,event]};
 return {case:next,events:[event]};
}

/** Pure batch evaluation. The caller must persist cases/events transactionally,
 * enforcing a unique key on event.id and optimistic locking on case.revision.
 */
export function runAgentBatch({cases,now,quotesByCaseId={},minMargin=0.18,maxCases=100}={}){
 iso(now);
 if(!Array.isArray(cases)||!Number.isInteger(maxCases)||maxCases<1||maxCases>1000)
  throw new Error('INVALID_BATCH_INPUT');
 const ids=new Set();
 for(const item of cases){
  if(ids.has(item.id))throw new Error('DUPLICATE_CASE_ID');
  ids.add(item.id);
 }
 const sorted=[...cases].sort((a,b)=>Date.parse(a.nextRunAt)-Date.parse(b.nextRunAt)||
  a.id.localeCompare(b.id));
 const updated=new Map(),events=[];
 for(const item of sorted.slice(0,maxCases)){
  const result=advanceCharterCase(item,{now,pricing:quotesByCaseId[item.id]??null,minMargin});
  updated.set(item.id,result.case);
  events.push(...result.events);
 }
 return {cases:cases.map(item=>updated.get(item.id)??item),events,processed:updated.size};
}
