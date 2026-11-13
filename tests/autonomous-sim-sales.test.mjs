import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261113090000_ops5_autonomous_sim_sales.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../app/sales-autopilot/page.tsx',import.meta.url),'utf8');
const menu=readFileSync(new URL('../components/ops-shell.tsx',import.meta.url),'utf8');
const sales=readFileSync(new URL('../app/simulation/page.tsx',import.meta.url),'utf8');

test('customer and offer simulation are tied to existing, not copied charter requests',()=>{
 assert.match(sql,/FROM public\.charter_requests r/);
 assert.match(sql,/r\.origin='simulation'/);
 assert.match(sql,/LEFT JOIN public\.charter_assessments a/);
 assert.match(sql,/FOREIGN KEY\(request_id,organization_id\)/);
 assert.match(sql,/REFERENCES public\.charter_requests/);
 assert.match(sql,/UNIQUE\(organization_id,request_id\)/);
 assert.doesNotMatch(sql,/\bINSERT INTO public\.charter_requests\b/);
 assert.doesNotMatch(sql,/\bUPDATE public\.charter_requests\b/);
});

test('autonomous Sales starts with large dedicated synthetic CRM and does not send email',()=>{
 assert.match(sql,/generate_series\(1,144\)/);
 assert.match(sql,/CREATE TABLE public\.sim_crm_personas/);
 assert.match(sql,/ON CONFLICT\(organization_id,persona_no\) DO NOTHING/);
 assert.match(sql,/CREATE TABLE public\.sim_sales_messages/);
 assert.match(sql,/CHECK\(NOT external_delivery\)/);
 assert.doesNotMatch(sql,/net\.http_post|pg_net|send_email|https?:\/\//i);
});

test('proposed quote and counteroffer never become a flight release or revenue posting',()=>{
 assert.match(sql,/CHECK\(NOT contract_confirmed\)/);
 assert.match(sql,/CHECK\(NOT flight_released\)/);
 assert.match(sql,/CHECK\(NOT external_delivery\)/);
 assert.match(sql,/interested_pending_ops/);
 assert.match(sql,/awaiting_model_price/);
 assert.match(sql,/customer_counteroffer/);
 assert.match(sql,/model_cost_eur\*1\.15/);
 assert.doesNotMatch(sql,/\bINSERT INTO public\.(?:sim_journals|shadow_flights|shadow_treasury_movements|resource_reservations)\b/i);
 assert.doesNotMatch(sql,/\bUPDATE public\.(?:aircraft|employees|charter_assessments|charter_requests)\b/i);
});

test('scheduled bot is postgres-only; all frontend tables use owner RLS and immutable contracts',()=>{
 assert.match(sql,/cron\.schedule\(/);
 assert.match(sql,/15,45 \* \* \* \*/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT SELECT ON public\.%I TO authenticated/);
 assert.match(sql,/owner_user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION ops_internal\.advance_sim_sales/);
 assert.doesNotMatch(sql,/GRANT INSERT .*authenticated|GRANT UPDATE .*authenticated/i);
});

test('autonomous interface uses the protected workspace, not a manual case form',()=>{
 assert.match(ui,/requireWorkspace\(\)/);
 assert.match(ui,/\.eq\('organization_id',organization\.id\)/);
 assert.match(ui,/sim_sales_cases/);
 assert.match(ui,/sim_crm_personas/);
 assert.match(ui,/sim_sales_messages/);
 assert.match(ui,/sim_sales_runs/);
 assert.match(ui,/Kein verbindlicher Auftrag/);
 assert.match(ui,/nicht auf einer generativen Sprach-KI/);
 assert.doesNotMatch(ui,/<form|type="submit"|\.insert\(|\.update\(/);
 assert.match(menu,/href="\/sales-autopilot"/);
 assert.match(sales,/href="\/sales-autopilot"/);
});
