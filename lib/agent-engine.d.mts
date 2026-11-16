/** Public TypeScript contract for the self-hosted .mjs agent engine. */
export type CustomerStrategy='value'|'bargain'|'strict';
export type CharterStage='new'|'awaiting_model_price'|'indicative_quote'|
 'counter_offer'|'interested_pending_ops'|'declined'|'declined_pricing';
export type PriceInput={estimatedCostEur:number;suggestedPriceEur:number};
export type PriceEstimate={estimatedCostEur:number;priceEur:number;floorEur:number;basis:'simulation_estimate'};
export type AgentEvent={
 id:string;caseId:string;revision:number;occurredAt:string;
 speaker:'customer'|'sales'|'system';eventType:string;body:string;simulated:true;
};
export type CharterCase={
 id:string;status:CharterStage;revision:number;createdAt:string;updatedAt:string;nextRunAt:string;
 request:{from:string;to:string;departsAt:string;passengers:number};
 customer:{id:string;displayName:string;budgetEur:number;strategy:CustomerStrategy};
 pricing:PriceEstimate|null;counterOfferEur:number|null;messages:AgentEvent[];
};
export const AGENT_ENGINE_VERSION:string;
export function createCharterCase(args:{
 id:string;createdAt:string;
 request:{from:string;to:string;departsAt:string;passengers:number};
 customer:{id:string;displayName?:string;budgetEur:number;strategy?:CustomerStrategy};
}):CharterCase;
export function advanceCharterCase(state:CharterCase,options:{
 now:string;pricing?:PriceInput|null;minMargin?:number;
}):{case:CharterCase;events:AgentEvent[]};
export function runAgentBatch(options:{
 cases:CharterCase[];now:string;quotesByCaseId?:Record<string,PriceInput>;
 minMargin?:number;maxCases?:number;
}):{cases:CharterCase[];events:AgentEvent[];processed:number};
