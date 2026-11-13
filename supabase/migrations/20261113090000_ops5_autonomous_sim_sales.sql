-- AERVELYS OPS5 — autonomous in-game CRM and sales dialogue.
-- Only existing origin='simulation' charter requests are processed.
-- Never alters operational flights, customers, request states or payments.

CREATE TABLE public.sim_crm_personas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 persona_no integer NOT NULL CHECK(persona_no BETWEEN 1 AND 144),
 display_name text NOT NULL CHECK(char_length(display_name) BETWEEN 5 AND 150),
 segment text NOT NULL CHECK(segment IN ('executive','leisure','events','corporate')),
 price_sensitivity integer NOT NULL CHECK(price_sensitivity BETWEEN 1 AND 5),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,persona_no),
 UNIQUE(id,organization_id)
);

CREATE TABLE public.sim_sales_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 request_id uuid NOT NULL,
 persona_id uuid NOT NULL,
 stage text NOT NULL CHECK(stage IN (
  'awaiting_model_price','indicative_quote','counter_offer',
  'interested_pending_ops','declined','declined_pricing')),
 quoted_eur numeric(12,2),
 model_cost_eur numeric(12,2),
 customer_bid_eur numeric(12,2),
 blocker_code text NOT NULL,
 last_step_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only),
 contract_confirmed boolean NOT NULL DEFAULT false CHECK(NOT contract_confirmed),
 flight_released boolean NOT NULL DEFAULT false CHECK(NOT flight_released),
 external_delivery boolean NOT NULL DEFAULT false CHECK(NOT external_delivery),
 UNIQUE(organization_id,request_id),
 UNIQUE(id,organization_id),
 FOREIGN KEY(request_id,organization_id)
  REFERENCES public.charter_requests(id,organization_id),
 FOREIGN KEY(persona_id,organization_id)
  REFERENCES public.sim_crm_personas(id,organization_id),
 CHECK(quoted_eur IS NULL OR quoted_eur>0),
 CHECK(model_cost_eur IS NULL OR model_cost_eur>=0),
 CHECK(customer_bid_eur IS NULL OR customer_bid_eur>0)
);

CREATE TABLE public.sim_sales_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 case_id uuid NOT NULL,
 step integer NOT NULL CHECK(step BETWEEN 1 AND 20),
 speaker text NOT NULL CHECK(speaker IN ('sales','customer','system')),
 event_key text NOT NULL CHECK(event_key IN (
  'indicative_quote','needs_price','customer_interest',
  'customer_counteroffer','customer_decline','sales_counteraccepted',
  'sales_counterdeclined')),
 body text NOT NULL CHECK(char_length(body) BETWEEN 12 AND 800),
 created_at timestamptz NOT NULL DEFAULT now(),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only),
 external_delivery boolean NOT NULL DEFAULT false CHECK(NOT external_delivery),
 UNIQUE(case_id,step),
 FOREIGN KEY(case_id,organization_id)
  REFERENCES public.sim_sales_cases(id,organization_id)
);

CREATE TABLE public.sim_sales_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 ran_at timestamptz NOT NULL DEFAULT now(),
 cases_created integer NOT NULL CHECK(cases_created>=0),
 cases_advanced integer NOT NULL CHECK(cases_advanced>=0),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only)
);
CREATE INDEX sim_sales_run_org_time ON public.sim_sales_runs(organization_id,ran_at DESC);
CREATE INDEX sim_sales_case_org_stage ON public.sim_sales_cases(organization_id,stage,last_step_at DESC);
CREATE INDEX sim_sales_message_case_time ON public.sim_sales_messages(organization_id,case_id,step);

DO $policy$ DECLARE v_table text; BEGIN
 FOREACH v_table IN ARRAY ARRAY[
  'sim_crm_personas','sim_sales_cases','sim_sales_messages','sim_sales_runs'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',v_table);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',v_table);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING
    (EXISTS (SELECT 1 FROM public.organizations o
     WHERE o.id=organization_id AND o.owner_user_id=(SELECT auth.uid())))',
    v_table||'_owner_read',v_table);
 END LOOP;
END $policy$;

CREATE FUNCTION ops_internal.advance_sim_sales(p_at timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $worker$
DECLARE
 v_org record;
 v_req record;
 v_case record;
 v_persona uuid;
 v_persona_name text;
 v_case_id uuid;
 v_price numeric;
 v_cost numeric;
 v_decision integer;
 v_offer numeric;
 v_stage text;
 v_event text;
 v_body text;
 v_created integer;
 v_advanced integer;
 v_new_total integer:=0;
 v_step_total integer:=0;
BEGIN
 IF p_at IS NULL OR p_at<timestamp with time zone '2026-01-01 00:00:00+00'
 THEN RAISE EXCEPTION 'Invalid simulation time'; END IF;
 FOR v_org IN SELECT id FROM public.organizations ORDER BY id LOOP
  -- Avoid double decisions when cron jobs overlap.
  PERFORM pg_advisory_xact_lock(
   hashtext('aervelys_sim_sales'),hashtext(v_org.id::text));
  v_created:=0;
  v_advanced:=0;
  -- Reusable virtual NPC company profiles: 144 initial identities, not a tiny
  -- rotating list of 14 people. No emails, phone numbers or actual customers.
  INSERT INTO public.sim_crm_personas(
   organization_id,persona_no,display_name,segment,price_sensitivity
  )
  SELECT v_org.id,n,
   'SIM · ' ||
   (ARRAY['Aurelia','Helios','Novara','Meridian','Aster','Solstice',
    'Vesper','Cobalt','Orion','Lunaris','Arcadia','Valence'])[(n-1)%12+1] ||
   ' ' ||
   (ARRAY['Holdings','Advisory','Partners','Group','Capital','Ventures',
    'Events','Technologies','Industries','Executive','International',
    'Enterprises'])[((n-1)/12)+1],
   (ARRAY['executive','leisure','events','corporate'])[(n-1)%4+1],
   ((n-1)%5)+1
  FROM generate_series(1,144) n
  ON CONFLICT(organization_id,persona_no) DO NOTHING;

  FOR v_req IN
   SELECT r.id,r.departure_icao,r.arrival_icao,r.departure_at,
    a.illustrative_revenue_eur,a.illustrative_cost_eur,
    a.blocker_code
   FROM public.charter_requests r
   LEFT JOIN public.charter_assessments a ON
    a.request_id=r.id AND a.organization_id=r.organization_id
   WHERE r.organization_id=v_org.id AND r.origin='simulation'
     AND r.status='draft' AND r.created_at>=p_at-interval '120 days'
   ORDER BY r.created_at,r.id LIMIT 1000
  LOOP
   SELECT * INTO v_case FROM public.sim_sales_cases c
   WHERE c.organization_id=v_org.id AND c.request_id=v_req.id;

   IF NOT FOUND THEN
    SELECT id,display_name INTO v_persona,v_persona_name
    FROM public.sim_crm_personas
    WHERE organization_id=v_org.id
      AND persona_no=1+(abs(hashtext(v_req.id::text)::bigint)%144);
    v_price:=v_req.illustrative_revenue_eur;
    v_cost:=v_req.illustrative_cost_eur;
    v_stage:=CASE WHEN v_price>0 AND v_cost>=0
      THEN 'indicative_quote' ELSE 'awaiting_model_price' END;
    INSERT INTO public.sim_sales_cases (
     organization_id,request_id,persona_id,stage,quoted_eur,
     model_cost_eur,blocker_code,last_step_at,created_at
    ) VALUES (
     v_org.id,v_req.id,v_persona,v_stage,
     CASE WHEN v_stage='indicative_quote' THEN v_price ELSE NULL END,
     CASE WHEN v_stage='indicative_quote' THEN v_cost ELSE NULL END,
     coalesce(v_req.blocker_code,'COMPLIANCE_UNVERIFIED'),p_at,p_at
    ) RETURNING id INTO v_case_id;
    INSERT INTO public.sim_sales_messages (
     organization_id,case_id,step,speaker,event_key,body,created_at
    ) VALUES(
     v_org.id,v_case_id,1,'sales',
     CASE WHEN v_stage='indicative_quote' THEN 'indicative_quote'
      ELSE 'needs_price' END,
     CASE WHEN v_stage='indicative_quote' THEN
      'AERVELYS Sales an '||v_persona_name||': unverbindlicher SIM-Richtpreis '||
      to_char(v_price,'FM999999990.00')||' EUR für '||
      v_req.departure_icao||'–'||v_req.arrival_icao||
      '. Noch keine Verfügbarkeit, Buchung oder Flugfreigabe. Prüfstatus: '||
      coalesce(v_req.blocker_code,'UNVERIFIED')||'.'
     ELSE 'AERVELYS Sales: Simulationsanfrage '||v_req.departure_icao||
      '–'||v_req.arrival_icao||
      ' eingegangen. Preisgrundlage fehlt; keine Angebotsabgabe.' END,p_at
    );
    v_created:=v_created+1;
    CONTINUE;
   END IF;

   IF p_at<v_case.last_step_at+interval '30 minutes' THEN CONTINUE; END IF;

   IF v_case.stage='indicative_quote' THEN
    v_decision:=abs(hashtext(v_req.id::text||':customer_response')::bigint)%5;
    IF v_decision=0 THEN
     v_stage:='declined';v_event:='customer_decline';
     v_body:='Fiktiver Kunde: Wir verzichten auf diese Charteranfrage. Vielen Dank für die unverbindliche Indikation.';
     v_offer:=NULL;
    ELSIF v_decision=1 OR v_decision=2 THEN
     v_stage:='counter_offer';v_event:='customer_counteroffer';
     v_offer:=round(v_case.quoted_eur*0.9,2);
     v_body:='Fiktiver Kunde: Wir interessieren uns für die Route, wünschen aber einen simulierten Richtpreis von '||
      to_char(v_offer,'FM999999990.00')||
      ' EUR. Keine verbindliche Buchung.';
    ELSE
     v_stage:='interested_pending_ops';v_event:='customer_interest';
     v_offer:=NULL;
     v_body:='Fiktiver Kunde: Interesse am SIM-Charter bestätigt. Wir warten auf technische, Crewing- und Dispatch-Prüfung. Noch keine Buchung.';
    END IF;
    UPDATE public.sim_sales_cases SET stage=v_stage,customer_bid_eur=v_offer,
     last_step_at=p_at WHERE id=v_case.id AND organization_id=v_org.id;
    INSERT INTO public.sim_sales_messages(
      organization_id,case_id,step,speaker,event_key,body,created_at
    ) VALUES(v_org.id,v_case.id,2,'customer',v_event,v_body,p_at);
    v_advanced:=v_advanced+1;
   ELSIF v_case.stage='counter_offer' THEN
    IF v_case.customer_bid_eur>=v_case.model_cost_eur*1.15
       AND v_case.customer_bid_eur>0 THEN
     v_stage:='interested_pending_ops';
     v_event:='sales_counteraccepted';
     v_body:='AERVELYS Sales: SIM-Gegenangebot als unverbindlicher Verhandlungsstand vorgemerkt. Flugzeug, Crew, Finanzierung und Dispatch bleiben ungeprüft; keine Charterannahme.';
    ELSE
     v_stage:='declined_pricing';v_event:='sales_counterdeclined';
     v_body:='AERVELYS Sales: SIM-Gegenangebot unterschreitet die interne Modellmarge. Anfrage im Verkauf abgelehnt, keine Buchung.';
    END IF;
    UPDATE public.sim_sales_cases SET stage=v_stage,last_step_at=p_at
     WHERE id=v_case.id AND organization_id=v_org.id;
    INSERT INTO public.sim_sales_messages(
      organization_id,case_id,step,speaker,event_key,body,created_at
    ) VALUES(v_org.id,v_case.id,3,'sales',v_event,v_body,p_at);
    v_advanced:=v_advanced+1;
   END IF;
  END LOOP;
  INSERT INTO public.sim_sales_runs(
   organization_id,ran_at,cases_created,cases_advanced
  ) VALUES(v_org.id,p_at,v_created,v_advanced);
  v_new_total:=v_new_total+v_created;
  v_step_total:=v_step_total+v_advanced;
 END LOOP;
 RETURN jsonb_build_object('simulation_only',true,
  'new_cases',v_new_total,'advanced_cases',v_step_total,
  'contracts_confirmed',0,'flights_released',0,'real_messages_sent',0);
END $worker$;

REVOKE ALL ON FUNCTION ops_internal.advance_sim_sales(timestamptz)
 FROM PUBLIC,anon,authenticated;

SELECT cron.schedule(
 'aervelys-ops5-autonomous-sales-30min',
 '15,45 * * * *',
 'select ops_internal.advance_sim_sales(now());'
);
