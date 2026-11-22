import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateBatchInvoices } from "../actions";
export const dynamic="force-dynamic";
type Search={error?:string;generated?:string;failed?:string};
export default async function ImportBatchPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Search>}){
 const {id}=await params;const query=await searchParams;const supabase=await createClient();const {data:claims}=await supabase.auth.getClaims();if(!claims?.claims?.sub)redirect("/login");
 const {data:businesses}=await supabase.from("businesses").select("id").order("created_at",{ascending:true}).limit(1);if(!businesses?.[0])redirect("/onboarding");
 const [{data:batch},{data:rows}]=await Promise.all([
  supabase.from("bulk_import_batches").select("*,customers(legal_name)").eq("id",id).eq("business_id",businesses[0].id).maybeSingle(),
  supabase.from("bulk_import_rows").select("*").eq("batch_id",id).order("source_row_number")
 ]);
 if(!batch)redirect("/imports");
 const canGenerate=batch.eligible_rows>0&&batch.status!=="completed"&&batch.status!=="generating";
 return <div className="module-page"><header className="module-header"><Link className="module-brand" href="/app"><span className="brand-mark">GI</span> Goods Invoice</Link><Link className="back-link" href="/imports">← Imports</Link></header><main className="module-content">
 <div className="eyebrow">IMPORT PREVIEW</div><h1 className="page-title">{batch.file_name}</h1><p className="page-desc">Customer: {(batch.customers as any)?.legal_name||"—"} · Batch status: {batch.status}</p>
 {query.error&&<div className="form-alert error">{query.error}</div>}{query.generated&&<div className="form-alert">Generated: {query.generated} · Failed: {query.failed||"0"}</div>}
 <div className="import-stats"><div><strong>{batch.total_rows}</strong><span>Total rows</span></div><div><strong>{batch.eligible_rows}</strong><span>Eligible</span></div><div><strong>{batch.skipped_rows}</strong><span>Skipped</span></div><div><strong>{batch.error_rows}</strong><span>Errors</span></div></div>
 {canGenerate&&<form action={generateBatchInvoices} className="module-card generate-panel"><input type="hidden" name="batch_id" value={batch.id}/><p>Each eligible row will create one separate draft invoice. Product descriptions, HSN, GST rates and default prices come from Product Master. Verify master rates before generating.</p><button className="primary-btn" type="submit">Generate {batch.eligible_rows} draft invoices →</button></form>}
 <section className="module-card"><div className="panel-head"><div className="panel-title">Row-by-row validation</div></div><div className="table-wrap"><table><thead><tr><th>Excel row</th><th>Date</th><th>Material supplier</th><th>Vehicle</th><th>Quantities</th><th>Status</th><th>Result</th></tr></thead><tbody>{(rows||[]).map(r=>{const m=r.materials as Record<string,{quantity:number}>;return <tr key={r.id}><td>{r.source_row_number}</td><td>{r.source_date||"—"}</td><td>{r.material_supplier||"—"}</td><td>{r.vehicle_number||"—"}</td><td>{Object.entries(m||{}).map(([k,v])=>k+": "+v.quantity).join(" · ")||"—"}</td><td>{r.validation_status}</td><td>{r.invoice_id?<Link className="text-action" href={"/invoices/"+r.invoice_id}>Open invoice</Link>:r.validation_message}</td></tr>})}</tbody></table></div></section>
 </main></div>;
}
