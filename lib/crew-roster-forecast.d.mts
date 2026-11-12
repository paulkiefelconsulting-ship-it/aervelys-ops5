export type RosterPerson={
 id:string;name:string;role:'PIC'|'SIC';employmentStatus:string;
};
export type RosterDuty={
 id:string;employeeId:string;startsAt:string;endsAt:string;kind:string;state:string;
};
export type RosterFlight={
 id:string;status:string;departureAt:string;arrivalAt:string;
 departureIcao:string;arrivalIcao:string;
};
export type RosterAssignment={
 shadowFlightId:string;employeeId:string;role:'PIC'|'SIC';
};
export type RosterAutoSlot={id:string;employeeId:string;startsAt:string;endsAt:string;};
export type RosterDraftSlot={
 id:string;employeeId:string;startsAt:string;endsAt:string;
 kind:'standby'|'training'|'office'|'rest'|'absence';
};
export type RosterEvent={
 id:string;kind:string;state:string;label:string;startsAt:string;endsAt:string;
};
export type RosterDay={
 date:string;kind:'conflict'|'absence'|'recorded'|'shadow'|'draft'|'auto'|'unplanned';
 events:RosterEvent[];standbyCandidate:boolean;
};
export type RosterPersonRow={
 employeeId:string;name:string;role:'PIC'|'SIC';employmentStatus:string;
 days:RosterDay[];recordedDays:number;shadowDays:number;conflictDays:number;
};
export type RosterStandbySlot={
 employeeId:string;name:string;startsAt:string;endsAt:string;
};
export type RosterStandbyDay={
 date:string;PIC:RosterStandbySlot|null;SIC:RosterStandbySlot|null;
 qualificationStatus:'UNVERIFIED';
};
export type RosterWeek={
 index:number;startDate:string;endDate:string;recordedDays:number;shadowDays:number;
 conflictDays:number;standbyPicIdeas:number;standbySicIdeas:number;
};
export type RosterPreview={
 status:'preview';reason:null;startDate:string;weeks:number;days:string[];
 rows:RosterPersonRow[];standby:RosterStandbyDay[];weeksSummary:RosterWeek[];
 totals:{pilots:number;conflictDays:number;unplannedDays:number;
 standbyIdeas:number;flightApprovals:0;verifiedTypeRatings:0};
};
export type RosterUnavailable={
 status:'unavailable';reason:string;startDate:string;weeks:number;days:[];
 rows:[];standby:[];weeksSummary:[];totals:null;
};
export declare function buildCrewRosterForecast(input:{
 startDate:string;weeks?:2|4|8|12;people?:RosterPerson[];dutyBlocks?:RosterDuty[];
 shadowFlights?:RosterFlight[];shadowAssignments?:RosterAssignment[];
 draftSlots?:RosterDraftSlot[];autoSlots?:RosterAutoSlot[];
 asOf?:string;dataComplete?:boolean;
}):RosterPreview|RosterUnavailable;
