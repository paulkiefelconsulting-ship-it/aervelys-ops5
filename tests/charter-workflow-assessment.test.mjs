import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessCharterWorkflow} from '../lib/charter-workflow-assessment.mjs';
const req={departure_at:'2026-11-20T14:00:00Z',departure_icao:'EDAZ',arrival_icao:'EDDH'};
const sale={stage:'interested_pending_ops',quoted_eur:12000};
const review={candidate_registration:'D-CPHE',blocker_code:'COMPLIANCE_CHECKS_NOT_IMPLEMENTED',blocker_detail:'Incomplete',evaluated_at:'2026-11-18T08:00:00Z'};
const aircraftScreenings=[{registration:'D-CPHE',status:'review',issues:[{code:'OPERATIONS_NOT_VERIFIED',kind:'unverified',label:'Outstanding'}]}];
const crewRun={screening_day:'2026-11-18',status:'blocked',created_at:'2026-11-18T08:00:00Z',reason:'Verification',candidate_aircraft_id:'one'};
const crewChecks=[{crew_role:'PIC',status:'cleared',blocking_reasons:[]},{crew_role:'SIC',status:'cleared',blocking_reasons:[]}];
const evaluate=(overrides={})=>assessCharterWorkflow({request:req,sale,aircraftReview:review,aircraftScreenings,crewRun,crewChecks,...overrides});
test('no workflow state authorizes a real or fictional flight release',()=>{
 const result=evaluate();
 assert.equal(result.releaseAllowed,false);
 assert.equal(result.state,'blocked');
 assert.ok(result.gates.some(x=>x.id==='operations'&&x.state==='blocked'));
 assert.ok(result.gates.some(x=>x.id==='timing'&&x.state==='blocked'));
});
test('different aircraft reference cannot be quietly accepted',()=>{
 const result=evaluate({aircraftReview:{...review,candidate_registration:'D-UNKNOWN'}});
 assert.equal(result.gates.find(x=>x.id==='aircraft').state,'blocked');
});
test('crew snapshots without both unblocked PIC and SIC fail closed',()=>{
 const result=evaluate({crewChecks:[{crew_role:'PIC',status:'cleared',blocking_reasons:[]}]});
 assert.equal(result.gates.find(x=>x.id==='crew').state,'blocked');
});
test('expired or inconsistent crew snapshot cannot be considered provisionally checked',()=>{
 const result=evaluate({crewRun:{...crewRun,created_at:'2026-11-21T09:00:00Z'}});
 assert.equal(result.gates.find(x=>x.id==='crew').state,'blocked');
});
test('truncated evidence and absent request produce unavailable status',()=>{
 assert.equal(evaluate({dataComplete:false}).state,'unavailable');
 assert.equal(evaluate({request:undefined}).state,'unavailable');
 assert.equal(evaluate({sale:undefined}).gates.find(x=>x.id==='sales').state,'blocked');
});
test('charter integration remains owner-scoped and read only',()=>{
 const ui=readFileSync(new URL('../app/charter-desk/page.tsx',import.meta.url),'utf8');
 assert.match(ui,/requireWorkspace\(\)/);
 assert.match(ui,/assessCharterWorkflow/);
 assert.match(ui,/dataComplete:!incomplete&&screeningComplete/);
 assert.match(ui,/Keine operative Freigabe/);
 assert.doesNotMatch(ui,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|<form|type="submit"/);
});
