export type OpsModule = {id:string;name:string;description:string};
export const modules: readonly OpsModule[] = [
  {id:'executive',name:'Executive Management',description:'Freigaben, Strategie und Geschäftsführung'},
  {id:'fleet',name:'Fleet Management',description:'Flugzeuge, Standorte und technische Verfügbarkeit'},
  {id:'crew',name:'Crew Management',description:'Qualifikationen, Dienst- und Ruhezeiten'},
  {id:'flight-ops',name:'Flight Operations',description:'Flugvorbereitung, Freigaben und Recovery'},
  {id:'scheduler',name:'Predictive Scheduling',description:'Geschützte Folgeaufträge und Umlaufplanung'},
  {id:'ground',name:'Ground Operations',description:'Handling, Transfers und Crewpositionierung'},
  {id:'sales',name:'Sales & Charter',description:'Anfragen, Kalkulation und Kundenangebote'},
  {id:'crm',name:'Customer Management',description:'Kundenprofile und Nachfrage-Simulation'},
  {id:'banking',name:'Simulation Banking',description:'Strikte Trennung von Privat- und Firmenkonten'},
  {id:'accounting',name:'Finance & Accounting',description:'Buchungsjournal, Rechnungen und Berichte'},
  {id:'hr',name:'HR & Payroll',description:'Verträge, Lohnlauf und Freigabeprozesse'},
  {id:'ai-core',name:'AI Workforce',description:'Koordinierte Agenten, Aufgaben und Entscheidungen'},
  {id:'comms',name:'Internal Communication',description:'Mitarbeiternachrichten und Übergaben'},
  {id:'safety',name:'Safety & Compliance',description:'Deterministische Schutzprüfungen'},
  {id:'simulation',name:'Simulation Engine',description:'Serverseitige Zeit, Ereignisse und Wiederanlauf'},
  {id:'observability',name:'Monitoring & Recovery',description:'Auditlog, Dead-Letter und Fehlerbehandlung'}
] as const;
