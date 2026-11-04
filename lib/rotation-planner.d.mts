export type RotationAircraft={
 id:string;registration:string;type:string;
 currentIcao:string|null;availableAt:string|null;operationalStatus:string;
 charterReleased:boolean;airportPerformanceVerified:boolean;
};
export type RotationCrew={
 id:string;name:string;role:string;aircraftTypes:string[];
 currentIcao:string|null;availableAt:string|null;
 verified:boolean;operationalStatus:string;
 lastDutyEnd?:string|null;minimumRestMinutes?:number;
};
export type RotationRequest={
 id:string;aircraftId?:string|null;from:string;to:string;
 departsAt:string|null;arrivesAt:string|null;
};
export type PositioningRoute={
 from:string;to:string;durationMinutes:number;costEur?:number;mode?:string;
};
export type RotationCommitment={
 aircraftId?:string;crewId?:string;startsAt:string;endsAt:string;fromIcao?:string;
};
export type RotationResult={
 requestId:string;status:'blocked';code:string;detail:string;
}|{
 requestId:string;status:'proposed';aircraftId:string;registration:string;
 from:string;to:string;departsAt:string;arrivesAt:string;
 aircraftPositioning:null|{from:string;to:string;startsAt:string;endsAt:string;costEur:number};
 crew:Array<{id:string;role:string;name:string;
  positioning:null|{from:string;to:string;mode:string;startsAt:string;endsAt:string;costEur:number};
  ferryDuty:null|{from:string;to:string;startsAt:string;endsAt:string};
 }>;positioningCostEur:number;
};
export declare function proposeRotations(input?:{
 aircraft?:RotationAircraft[];crew?:RotationCrew[];requests?:RotationRequest[];
 aircraftRoutes?:PositioningRoute[];crewRoutes?:PositioningRoute[];
 commitments?:RotationCommitment[];turnaroundMinutes?:number;crewReportMinutes?:number;
}):RotationResult[];
