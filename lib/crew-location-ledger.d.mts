export type CrewLocationPerson={
 id:string;name?:string;role?:string;homeBaseIcao?:string|null;
};
export type CrewLocationEvent={
 id:string;employeeId:string;eventType:string;
 verificationState:string;originIcao?:string|null;locationIcao?:string|null;
 departedAt?:string|null;occurredAt:string;recordedAt:string;
 verifiedAt?:string|null;sourceReference?:string|null;
};
export type CrewLocationProjection={
 employeeId:string;name:string;role:string;homeBaseIcao:string|null;
 status:'unknown'|'blocked'|'verified'|'stale';
 locationIcao:string|null;lastEvidenceIcao:string|null;
 verifiedAt:string|null;sourceReference:string|null;
 lastEventAt:string|null;lastEventId:string|null;reason:string;
 eventsEvaluated:number;history:Array<{id:string;result:string;reason:string}>;
};
export declare function projectCrewLocations(input?:{
 people?:CrewLocationPerson[];events?:CrewLocationEvent[];
 asOf?:string;maxAgeMinutes?:number;
}):CrewLocationProjection[];
export declare function draftCrewArrivalEvent(input?:{
 employeeId:string;fromIcao:string;toIcao:string;departedAt:string;
 arrivedAt:string;kind:'flight_arrival'|'transfer_arrival';sourceReference:string;
}):{status:'blocked';reason:string}|{
 status:'draft_only';employeeId:string;eventType:string;originIcao:string;
 locationIcao:string;departedAt:string;occurredAt:string;
 sourceReference:string;verificationState:'pending';
};
