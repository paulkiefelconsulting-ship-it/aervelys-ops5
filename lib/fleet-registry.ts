export type FleetSeed={registration:string;aircraft_type:string;home_base_icao:string;current_icao:string|null};
export const fleetSeed:readonly FleetSeed[]=[
 {registration:'D-CJPK',aircraft_type:'Cessna Citation CJ4',home_base_icao:'EDAZ',current_icao:'EDAZ'},
 {registration:'D-CPLK',aircraft_type:'Pilatus PC-24',home_base_icao:'EDAZ',current_icao:'EDAZ'},
 {registration:'D-CPHE',aircraft_type:'Embraer Phenom 300E',home_base_icao:'EDAZ',current_icao:'EDAZ'},
 {registration:'D-BLNG',aircraft_type:'Cessna Citation Longitude',home_base_icao:'EDDB',current_icao:'EDDB'},
 {registration:'N551VG',aircraft_type:'Cirrus Vision Jet G2',home_base_icao:'EDAZ',current_icao:'EDAZ'},
 {registration:'D-CKPX',aircraft_type:'Cessna Citation X',home_base_icao:'EDAZ',current_icao:null},
 {registration:'D-CHPK',aircraft_type:'Hawker 800XP',home_base_icao:'EDAZ',current_icao:null}
];
/** These are simulation suggestions, not evidence of registration availability or legal validity. */
export function suggestedPrefix(type:string):string|null{
 const t=type.toLowerCase().trim();
 if(/longitude|citation x\b/.test(t))return 'D-B';
 if(/cj4|pc-24|phenom 300|hawker 800/.test(t))return 'D-C';
 if(/vision jet/.test(t))return 'D-F';
 return null;
}
export function nextFleetRegistration(prefix:string,used:Iterable<string>):string{
 if(!/^D-[A-Z]$/.test(prefix))throw new Error('Ungültige deutsche Kennzeichenklasse');
 const taken=new Set(Array.from(used,v=>v.toUpperCase()));
 // AEV–AZZ, then BAA onward: deterministic local fictional registry.
 for(let x=0;x<26*26*26;x++){
  const suffix=String.fromCharCode(65+Math.floor(x/676),65+Math.floor((x%676)/26),65+x%26);
  if(suffix<'AEV')continue;
  const code=prefix+suffix;
  if(!taken.has(code))return code;
 }
 throw new Error('Keine Vorschläge verfügbar');
}
