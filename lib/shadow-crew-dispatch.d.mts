export type ShadowDispatchCandidate={
 id:string;name:string;role:string;issue:string|null;
 costEur?:number;fromIcao?:string;toIcao?:string;
 startsAt?:string;reportAt?:string;travelMinutes?:number;
};
export type ShadowDispatchInputFlight={
 id:string;status:string;departureIcao:string;arrivalIcao:string;
 departureAt:string;arrivalAt:string;
};
export type ShadowDispatchInputPlan={
 flightId:string;status:string;issue:string|null;
 boardingIcao?:string;reportAt?:string;
 candidates:{PIC:ShadowDispatchCandidate[];SIC:ShadowDispatchCandidate[]};
};
export type ShadowDispatchSavedSeat={
 shadowFlightId:string;employeeId:string;role:'PIC'|'SIC';
};
export type ShadowDispatchRow={
 flightId:string;from:string;to:string;departureAt:string;
 reportAt:string|null;lockedSeats:number;
 status:'proposal'|'blocked';reason:string|null;
 pic:ShadowDispatchCandidate|null;sic:ShadowDispatchCandidate|null;
 costEur:number|null;
};
export declare function proposeShadowCrewDispatch(input?:{
 flights?:ShadowDispatchInputFlight[];plans?:ShadowDispatchInputPlan[];
 assignments?:ShadowDispatchSavedSeat[];
 minimumRestMinutes?:number;
}):ShadowDispatchRow[];
