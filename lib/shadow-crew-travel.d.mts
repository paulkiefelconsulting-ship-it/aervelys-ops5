export type ShadowTraveler={
 id:string;name:string;role:'PIC'|'SIC';
};
export type ShadowFlightPlan={
 id:string;status:string;departureIcao:string;arrivalIcao:string;
 departureAt:string;arrivalAt:string;aircraftType:string;
};
export type ShadowCrewAssignment={
 shadowFlightId:string;employeeId:string;role:'PIC'|'SIC';
};
export type ShadowCrewAnchor={
 employeeId:string;eventType:string;verificationState:string;
 sourceReference:string;occurredAt:string;locationIcao:string|null;
};
export type ShadowMovement={
 id:string;employeeId:string;status:string;departedAt:string;arrivedAt:string;
 fromIcao:string;toIcao:string;sourceKind?:'charter'|'ferry'|'ground'|string;
};
export type ShadowRoute={
 id:string;fromIcao:string;toIcao:string;
 mode:'shuttle'|'rail'|'airline';
 durationMinutes:number;costEur:number;simulationOnly:boolean;
};
export type ShadowFerry={
 shadowFlightId:string;status:string;departureAt:string|null;arrivalAt:string|null;
 fromIcao:string;toIcao:string;
};
export type TravelStep={
 routeId:string;mode:string;fromIcao:string;toIcao:string;
 startsAt:string;endsAt:string;costEur:number;
};
export type TravelCandidate={
 id:string;name:string;role:string;issue:string|null;
 fromIcao?:string;toIcao?:string;
 travelMinutes?:number;costEur?:number;steps?:TravelStep[];
 startsAt?:string;reportAt?:string;restRule?:string;locationEvidence?:string;
 qualificationStatus?:string;
};
export type ShadowCrewTravelResult={
 flightId:string;status:'scenario_proposal'|'blocked';issue:string|null;
 pic:TravelCandidate|null;sic:TravelCandidate|null;
 estimatedCostEur?:number|null;boardingIcao?:string;reportAt?:string;
 ferry?:boolean;issues?:string[];
 candidates:{PIC:TravelCandidate[];SIC:TravelCandidate[]};
};
export declare function listCrewItineraries(
 from:string,to:string,catalog:ShadowRoute[],connectionMinutes?:number
):Array<{legs:Array<{id:string;fromIcao:string;toIcao:string;mode:string;durationMinutes:number;costEur:number}>;
 durationMinutes:number;costEur:number;mode:string}>;
export declare function proposeShadowCrewTravel(input?:{
 people?:ShadowTraveler[];flights?:ShadowFlightPlan[];assignments?:ShadowCrewAssignment[];
 checkins?:ShadowCrewAnchor[];movements?:ShadowMovement[];routes?:ShadowRoute[];
 positioningLegs?:ShadowFerry[];asOf?:string;reportMinutes?:number;
 releaseMinutes?:number;minRestMinutes?:number;connectionMinutes?:number;
 maxAgeMinutes?:number;
}):ShadowCrewTravelResult[];
