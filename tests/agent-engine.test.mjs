import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharterCase,advanceCharterCase,runAgentBatch,AGENT_ENGINE_VERSION} from '../lib/agent-engine.mjs';

const start='2026-11-16T10:00:00Z';
const at=min=>new Date(Date.parse(start)+min*60_000).toISOString();
const make=(id='charter-1',strategy='value',budgetEur=7500)=>createCharterCase({
 id,createdAt:start,
 request:{from:'EDDB',to:'LIML',departsAt:'2026-11-18T09:00:00Z',passengers:4},
 customer:{id:'customer-'+id,displayName:'Virtueller Kunde',budgetEur,strategy}
});
const next=(c,minute,extra={})=>advanceCharterCase(c,{now:at(minute),...extra});
const costs={estimatedCostEur:5000,suggestedPriceEur:6900};

test('self-built agent engine runs without SDKs or external API',()=>{
 assert.equal(AGENT_ENGINE_VERSION,'1.0.0');
 let c=make();
 let result=next(c,0);c=result.case;
 assert.equal(c.status,'awaiting_model_price');
 assert.equal(result.events[0].id,'charter-1:1');
 assert.equal(result.events[0].speaker,'customer');
 assert.equal(next(c,1).events.length,0);
 result=next(c,1,{pricing:costs});c=result.case;
 assert.equal(c.status,'indicative_quote');
 assert.equal(c.pricing.priceEur,6900);
 assert.match(result.events[0].body,/Unverbindliche/);
 assert.equal(next(c,10).events.length,0);
 c=next(c,16).case;
 assert.equal(c.status,'interested_pending_ops');
 assert.equal(c.messages.length,3);
 assert.equal(next(c,30).events.length,0);
 assert.equal(c.messages.some(m=>m.eventType==='charter.booked'),false);
});

test('bargaining persona counters and sales may accept within margin',()=>{
 let c=make('bargain','bargain',6800);
 c=next(c,0).case;
 c=next(c,1,{pricing:costs,minMargin:0.18}).case;
 c=next(c,16).case;
 assert.equal(c.status,'counter_offer');
 assert.equal(c.counterOfferEur,6486);
 c=next(c,31).case;
 assert.equal(c.status,'interested_pending_ops');
 assert.equal(c.messages[3].eventType,'sales.counter_accepted');
});

test('unprofitable counteroffer is rejected even by sales agent',()=>{
 let c=make('reject','bargain',7500);
 c=next(c,0).case;
 c=next(c,1,{pricing:{estimatedCostEur:6000,suggestedPriceEur:8400},minMargin:0.4}).case;
 c=next(c,16).case;
 assert.equal(c.counterOfferEur,7500);
 c=next(c,31).case;
 assert.equal(c.status,'declined_pricing');
 assert.equal(c.messages.at(-1).eventType,'sales.counter_rejected');
});

test('strict customer declines overpriced charter',()=>{
 let c=make('strict','strict',3000);
 c=next(c,0).case;
 c=next(c,1,{pricing:costs}).case;
 assert.equal(next(c,16).case.status,'declined');
});

test('price floor applies to insufficient suggested price',()=>{
 let c=make();c=next(c,0).case;
 c=next(c,1,{pricing:{estimatedCostEur:5000,suggestedPriceEur:1000},minMargin:0.2}).case;
 assert.equal(c.pricing.priceEur,6000);
 assert.equal(c.pricing.floorEur,6000);
});

test('invalid data is blocked, not silently completed',()=>{
 assert.throws(()=>make('x','value',0),/CUSTOMER_BUDGET_REQUIRED/);
 assert.throws(()=>createCharterCase({id:'x',createdAt:start,request:{
  from:'EDAZ',to:'EDAZ',departsAt:'2026-11-18T09:00:00Z',passengers:1
 },customer:{id:'c',budgetEur:2000}}),/INVALID_REQUEST/);
 let c=next(make(),0).case;
 assert.throws(()=>next(c,1,{pricing:{estimatedCostEur:0,suggestedPriceEur:100}}),
  /VERIFIED_PRICE_INPUT_REQUIRED/);
 assert.equal(next(c,1).case.status,'awaiting_model_price');
});

test('batch has deterministic event IDs and avoids modifying input',()=>{
 const cases=[make('b'),make('a')],snapshot=JSON.stringify(cases);
 const r=runAgentBatch({cases,now:start,maxCases:2});
 assert.deepEqual(r.events.map(x=>x.id),['a:1','b:1']);
 assert.equal(JSON.stringify(cases),snapshot);
 assert.deepEqual(runAgentBatch({cases,now:start}).events,r.events);
 assert.throws(()=>runAgentBatch({cases:[cases[0],cases[0]],now:start}),
  /DUPLICATE_CASE_ID/);
});
