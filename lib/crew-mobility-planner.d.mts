export type MobilityPerson={
 id:string;name?:string;role?:string;currentIcao?:string|null;
 homeBaseIcao?:string|null;availableAt?:string|null;
 lastDutyEnd?:string|null;locationVerified?:boolean;
 historyVerified?:boolean;minimumRestMinutes?:number;
};
export type MobilityDuty={
 id:string;employeeId:string;kind:string;
 startsAt:string;endsAt:string;fromIcao?:string|null;toIcao?:string|null;
 dutyPeriodId?:string|null;
};
export type MobilityRoute={
 from:string;to:string;mode:string;durationMinutes:number;costEur:number;verified:boolean;
};
export type MobilityHotel={
 airportIcao:string;rateEurPerNight:number;verified:boolean;
};
export type MobilityIssue={code:string;dutyId:string|null};
export type MobilityTravel={
 beforeDutyId:string;fromIcao:string;toIcao:string;mode:string;
 startsAt:string;endsAt:string;costEur:number;status:'estimate_not_booked';
};
export type MobilityStay={
 beforeDutyId:string;airportIcao:string;nights:number;
 rateEurPerNight:number;costEur:number;status:'estimate_not_booked';
};
export type MobilityDutyDetail={
 id:string;kind:string;startsAt:string;endsAt:string;
 fromIcao:string|null;toIcao:string|null;
 reportAt?:string;releaseAt?:string;
};
export type MobilityResult={
 employeeId:string;name:string;role:string;homeBaseIcao:string|null;
 lastVerifiedIcao:string|null;projectedEndIcao:string|null;
 status:'blocked'|'mobility_review_only';dutyCount:number;
 details:MobilityDutyDetail[];transfers:MobilityTravel[];stays:MobilityStay[];
 issues:MobilityIssue[];estimatedTravelAndHotelEur:number|null;
 returnSuggestion:null|{
  fromIcao:string;toIcao:string;mode:string;durationMinutes:number;
  costEur:number;status:'optional_not_booked';
 };
};
export declare function planCrewMobility(input?:{
 people?:MobilityPerson[];duties?:MobilityDuty[];travelRoutes?:MobilityRoute[];
 hotels?:MobilityHotel[];reportMinutes?:number;releaseMinutes?:number;
}):MobilityResult[];
