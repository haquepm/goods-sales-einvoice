import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { previewExcelImport } from "./actions";
export const dynamic="force-dynamic";
type Search={error?:string};
export default async function ImportsPage({searchParams}:{searchParams:Promise<Search>}){
 const params=await searchParams;const supabase=await createClient();const {data:claims}=await supabase.auth.getClaims();if(!claims?.claims?.sub)redirect("/login");
 const {data:businesses}=await supabase.from("businesses").select("id").order("created_at",{ascending:true}).limit(1);if(!businesses?.[0])redirect("/onboarding");
 const [{data:customers},{data:products},{data:batches}]=await Promise.all([
  supabase.from("customers").select("id,legal_name").eq("business_id",businesses[0].id).eq("is_active",true).order("legal_name"),
  supabase.from("products").select("id,description,hsn_code,unit_code").eq("business_id",businesses[0].id).eq("is_active",true).order("description"),
  supabase.from("bulk_import_batches").select("id,file_name,status,total_rows,eligible_rows,skipped_rows,error_rows,created_at").eq("business_id",businesses[0].id).order("created_at",{ascending:false}).limit(20)
 ]);
 return <div className="module-page"><header className="module-header"><Link className="module-brand" href="/app"><span className="brand-mark">GI</span> Goods Invoice</Link><Link className="back-link" href="/app">← Workspace</Link></header><main className="module-content">
 <div className="eyebrow">SALES / IMPORT</div><h1 className="page-title">Excel bulk invoices</h1><p className="page-desc">Upload a goods dispatch sheet, preview eligible rows, then create one draft invoice per valid row.</p>
 {params.error&&<div className="form-alert error">{params.error}</div>}
 <form action={previewExcelImport} className="module-card invoice-form import-form">
 <div className="panel-kicker">1 · IMPORT SETTINGS</div>
 <div className="form-grid"><div className="field"><label>Customer for all invoices *</label><select name="customer_id" required defaultValue=""><option value="" disabled>Select customer</option>{(customers||[]).map(c=><option key={c.id} value={c.id}>{c.legal_name}</option>)}</select></div>
 <div className="field"><label>12 MM product *</label><select name="product_12mm" required defaultValue=""><option value="" disabled>Map 12 MM</option>{(products||[]).map(p=><option key={p.id} value={p.id}>{p.description} · HSN {p.hsn_code}</option>)}</select></div>
 <div className="field"><label>20 MM product *</label><select name="product_20mm" required defaultValue=""><option value="" disabled>Map 20 MM</option>{(products||[]).map(p=><option key={p.id} value={p.id}>{p.description} · HSN {p.hsn_code}</option>)}</select></div>
 <div className="field"><label>M-SAND product *</label><select name="product_msand" required defaultValue=""><option value="" disabled>Map M-SAND</option>{(products||[]).map(p=><option key={p.id} value={p.id}>{p.description} · HSN {p.hsn_code}</option>)}</select></div>
 <div className="field full"><label>Excel workbook (.xlsx) *</label><input type="file" name="file" accept=".xlsx" required /></div></div>
 <div className="import-help"><strong>Expected columns</strong><p>DATE · NAME OF SUPPLIER · VEHICLE NUMBER · UNIT · 12 MM · 20 MM · M-SAND</p><p>Supplier is recorded as the material source, not as the invoice customer. The customer selected above applies to every generated invoice. Product master rates and GST settings are used.</p><p>Rows with all material quantities blank or zero are skipped and do not create or consume invoice numbers.</p></div>
 <button className="primary-btn" type="submit" disabled={!customers?.length||!products?.length}>Preview Excel rows →</button>
 </form>
 <section className="module-card"><div className="panel-head"><div className="panel-title">Recent import batches</div><div className="panel-hint">Latest 20</div></div>{batches?.length?<div className="table-wrap"><table><thead><tr><th>File</th><th>Date</th><th>Rows</th><th>Eligible</th><th>Skipped</th><th>Errors</th><th>Status</th><th></th></tr></thead><tbody>{batches.map(b=><tr key={b.id}><td>{b.file_name}</td><td>{new Date(b.created_at).toLocaleDateString("en-IN")}</td><td>{b.total_rows}</td><td>{b.eligible_rows}</td><td>{b.skipped_rows}</td><td>{b.error_rows}</td><td>{b.status}</td><td><a className="text-action" href={"/imports/"+b.id} target="_self">View</a></td></tr>)}</tbody></table></div>:<div className="empty">No Excel imports yet.</div>}</section>
 </main></div>;
}
