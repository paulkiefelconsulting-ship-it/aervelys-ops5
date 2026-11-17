/**
 * AERVELYS charter workflow evidence summary.
 * Read-only gate assessment for a fictional tycoon. NEVER a flight release.
 */
const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
const finiteTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
/**
 * @param {{
 *  request?:{departure_at:string,departure_icao:string,arrival_icao:string},
 *  sale?:{stage:string,quoted_eur:number|string|null},
 *  aircraftReview?:{candidate_registration:string|null,blocker_code:string,blocker_detail:string,evaluated_at:string},
 *  aircraftScreenings?:Array<{registration:string,status:string,issues:Array<{code:string,kind:string,label:string}>}>,
 *  crewRun?:{screening_day:string,status:string,created_at:string,reason:string,candidate_aircraft_id:string|null},
 *  crewChecks?:Array<{crew_role:string,status:string,blocking_reasons:string[]}>,
 *  dataComplete?:boolean
 * }} [input]
 */
export function assessCharterWorkflow({request,sale,aircraftReview,aircraftScreenings=[],crewRun,crewChecks=[],dataComplete=true}={}){
 if(!request||!finiteTime(request.departure_at)||!request.departure_icao||!request.arrival_icao){
  return {state:'unavailable',gates:[],nextSteps:['Charterroute und Abflugdatum vervollständigen'],releaseAllowed:false};
 }
 const gate=(id,label,state,detail)=>({id,label,state,detail});
 const gates=[];
 if(!dataComplete)gates.push(gate('source','Datenabgleich','blocked','Ein Teil der Quelldaten fehlt oder wurde begrenzt geladen.'));
 else gates.push(gate('source','Datenabgleich','review','Vorliegende Daten sind ein Schnappschuss; aktuelle operative Nachweise fehlen weiterhin.'));
 const saleReady=Boolean(sale&&['interested_pending_ops'].includes(sale.stage));
 gates.push(gate('sales','Charter & Sales',saleReady?'review':'blocked',
  !sale?'Kein Sales-Fall angelegt.':saleReady?'Kundeninteresse dokumentiert; kein verbindlicher Vertrag.':'Sales-Status: '+sale.stage));
 const aircraftMatch=aircraftScreenings.find(a=>a.registration===aircraftReview?.candidate_registration);
 const hasAircraft=Boolean(aircraftReview?.candidate_registration&&aircraftMatch);
 const aircraftBlocked=Boolean(!hasAircraft||aircraftMatch?.status==='blocked'||!dataComplete);
 gates.push(gate('aircraft','Aircraft & Position',aircraftBlocked?'blocked':'review',
  !aircraftReview?'Keine gespeicherte Dispatch-Vorprüfung.':
  !hasAircraft?'Prüfkandidat fehlt oder stimmt nicht mit dem aktuellen Flottenbestand überein.':
  aircraftMatch?.status==='blocked'?'Aircraft-Prüfung enthält Sperrgründe.':
  'Aircraft nur zur weiteren Prüfung vorgemerkt; keine Reservation.'));
 // Crew checks are snapshots. Even fully verified historical records cannot grant a new duty release.
 const checkedPIC=crewChecks.some(x=>x.crew_role==='PIC'&&x.status==='cleared'&&!(x.blocking_reasons??[]).length);
 const checkedSIC=crewChecks.some(x=>x.crew_role==='SIC'&&x.status==='cleared'&&!(x.blocking_reasons??[]).length);
 const crewFresh=Boolean(crewRun&&ISO_DAY.test(crewRun.screening_day)&&finiteTime(crewRun.created_at)
   &&Date.parse(crewRun.created_at)<=Date.parse(request.departure_at));
 const crewBlocked=Boolean(!crewRun||!crewFresh||!checkedPIC||!checkedSIC||!dataComplete);
 gates.push(gate('crew','Crew PIC / SIC',crewBlocked?'blocked':'review',
  !crewRun?'Kein Crew-Prüflauf vorhanden.':
  !crewFresh?'Crew-Prüfung zeitlich nicht verwendbar oder Prüfdatum ungültig.':
  !checkedPIC||!checkedSIC?'Keine vollständige PIC/SIC-Vorprüfung ohne Sperrgründe.':
  'Historische Crew-Prüfung vorhanden; aktuelle Duty/Rest und Standortfreigabe fehlen.'));
 gates.push(gate('timing','Rotation & Turnaround','blocked','Flugdauer, Ferry-Legs, Anschlüsse und vollständiges Zeitfenster nicht freigegeben.'));
 gates.push(gate('operations','Performance & Freigabe','blocked','Keine verifizierte Flugplatz-Performance, Kapazitätsprüfung oder operative Freigabe.'));
 const blockers=gates.filter(g=>g.state==='blocked');
 const nextSteps=blockers.map(g=>g.label+': '+g.detail);
 if(!nextSteps.length)nextSteps.push('Manuelle OPS-Nachweise und rechtliche Freigaben fehlen.');
 return {state:!dataComplete?'unavailable':'blocked',gates,nextSteps,releaseAllowed:false};
}
