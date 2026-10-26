import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getModule,type Field} from '../../../lib/modules';
import {requireWorkspace} from '../../../lib/workspace';
import OpsShell from '../../../components/ops-shell';
import {createModuleRecord} from '../actions';

export const dynamic='force-dynamic';
type DataRow=Record<string,unknown>;
type Choice={value:string;label:string};

function Cell({name,value,choices}:{name:string;value:unknown;choices:Choice[]}){
 if(value===null||value===undefined||value==='')return <>—</>;
 const reference=choices.find(x=>x.value===String(value));
 if(reference)return <>{reference.label}</>;
 if(name.endsWith('_at')||name==='sim_now'){
  const date=new Date(String(value));
  if(!Number.isNaN(date.getTime()))return <>{date.toLocaleString('de-DE',{timeZone:'UTC'})} UTC</>;
 }
 return <>{String(value)}</>;
}
function FieldInput({field,choices}:{field:Field;choices:Choice[]}){
 const noRequiredRef=field.kind==='reference'&&field.required&&choices.length===0;
 return <label className="formField">
  <span>{field.label}{field.required?' *':''}</span>
  {field.kind==='textarea'?<textarea name={field.key} required={!!field.required} rows={3} maxLength={field.max??4000}/>:
   (field.kind==='select'||field.kind==='reference')?
   <select name={field.key} defaultValue="" required={!!field.required} disabled={noRequiredRef}>
    <option value="">{field.kind==='reference'&&!choices.length?'Keine Einträge verfügbar':'Bitte auswählen'}</option>
    {(field.kind==='reference'?choices:(field.options??[]).map(s=>({value:s,label:s}))).map(opt=>
     <option value={opt.value} key={opt.value}>{opt.label}</option>)}
   </select>:
   <input name={field.key} required={!!field.required}
    type={field.kind==='datetime'?'datetime-local':field.kind==='number'?'number':field.kind}
    step={field.kind==='number'?(field.key==='passengers'?1:0.01):undefined}
    min={field.kind==='number'?0.01:undefined}
    maxLength={field.max&&field.kind!=='number'?field.max:undefined}/>
  }
  {noRequiredRef&&<small>Bitte zuerst den benötigten Stammdatensatz anlegen.</small>}
 </label>;
}
export default async function ModulePage({params,searchParams}:{
 params:Promise<{slug:string}>;searchParams:Promise<{result?:string}>;
}){
 const {slug}=await params;
 const module=getModule(slug);
 if(!module)notFound();
 const {supabase,organization}=await requireWorkspace();
 const {result}=await searchParams;
 const refs=module.fields.filter(f=>f.kind==='reference'&&f.ref);
 const lookup:Record<string,Choice[]>={};
 await Promise.all(refs.map(async field=>{
  const label=field.ref==='aircraft'?'registration':field.ref==='employees'?'display_name':'display_name';
  const {data}=await supabase.from(field.ref!).select('id,'+label)
   .eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(150);
  lookup[field.key]=((data??[]) as unknown as DataRow[]).map(row=>({value:String(row.id),label:String(row[label]??row.id)}));
 }));
 const {data,error}=await supabase.from(module.table).select('*')
  .eq('organization_id',organization.id).order(module.sort??'created_at',{ascending:false}).limit(50);
 const rows=(data??[]) as DataRow[];
 const notices:Record<string,string>={
  created:'Datensatz als Entwurf gespeichert.',
  duplicate:'Ein Datensatz mit diesen Angaben existiert bereits.',
  invalid:'Eingaben prüfen. Flugzeiten sind als UTC einzugeben.',
  failed:'Speichern fehlgeschlagen. Bitte Berechtigungen und Eingaben überprüfen.'
 };
 return <OpsShell active={module.id}>
  <div className="moduleBreadcrumb"><Link href="/">Overview</Link><span>/</span>{module.name}</div>
  <header className="header"><div><span className="eyebrow">{module.section.toUpperCase()} · OPS 5.0</span>
   <h1>{module.name}</h1><p>{module.description}</p></div>
   <span className="state">● {module.readonly?'Nur lesen':'Entwurfsbetrieb'}</span>
  </header>
  <section className="moduleBanner"><strong>{organization.name} · Entwicklungsumgebung</strong><p>{module.info}</p></section>
  {result&&notices[result]&&<p className={'feedback'+(result==='created'?' successFeedback':'')} role="status">{notices[result]}</p>}
  <div className="moduleLayout">
   <section className="workspacePanel">
    <div className="panelHeading"><h2>Datensätze</h2><span>{rows.length} angezeigt · maximal 50</span></div>
    {error?<div className="emptyState">Daten konnten nicht geladen werden. Datenbankrechte prüfen.</div>:
     rows.length===0?<div className="emptyState">Noch keine Einträge in diesem Bereich.</div>:
     <div className="tableScroll"><table className="dataTable"><thead><tr>
      {module.columns.map(column=><th key={column}>{column.replaceAll('_',' ')}</th>)}
     </tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id??row.organization_id??i)}>
      {module.columns.map(column=><td key={column}>{module.id==='crew' && column==='display_name' ? <Link className="staffLink" href={'/staff/'+String(row.id)}>{String(row[column]??'Personalakte')}</Link> : <Cell name={column} value={row[column]} choices={lookup[column]??[]}/>}</td>)}
     </tr>)}</tbody></table></div>}
   </section>
   <aside className="formPanel">
    <div className="panelHeading"><h2>{module.readonly?'Systemstatus':'Neuer Entwurf'}</h2></div>
    {module.readonly?<p className="panelNote">Schreibgeschützt. Automatisierte Abläufe und Freigaben bleiben deaktiviert.</p>:
     <form action={createModuleRecord} className="workspaceForm">
      <input type="hidden" name="module" value={module.id}/>
      {module.fields.map(field=><FieldInput field={field} choices={lookup[field.key]??[]} key={field.key}/>)}
      <button className="primaryButton" type="submit"
       disabled={refs.some(f=>f.required&&!lookup[f.key]?.length)}>Entwurf speichern</button>
      <small>Nur Datenentwürfe. Keine echten Flüge, Zahlungen, Nachrichten oder Buchungen.</small>
     </form>}
   </aside>
  </div>
 </OpsShell>;
}
