import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { issueAllDraftInvoices } from "./actions";

export const dynamic="force-dynamic";
export default async function InvoicesPage({searchParams}:{searchParams:Promise<{error?:string;success?:string}>}) {
 const notices=await searchParams;
 const supabase=await createClient();
 const {data:claims}=await supabase.auth.getClaims();
 if(!claims?.claims?.sub) redirect("/login");
 const {data:businesses}=await supabase.from("businesses").select("id").order("created_at",{ascending:true}).limit(1);
 if(!businesses?.length) redirect("/onboarding");
 const {data:invoices,error}=await supabase.from("goods_invoices").select("id,invoice_number,invoice_date,financial_year,grand_total,status,buyer_snapshot").eq("business_id",businesses[0].id).order("invoice_date",{ascending:false}).limit(100);
 if(error) throw new Error("Unable to load invoices.");
 return <div className="module-page"><header className="module-header"><Link className="module-brand" href="/app"><span className="brand-mark">GI</span> Goods Invoice</Link><Link className="back-link" href="/app">← Workspace</Link></header><main className="module-content">
 <div className="module-topline"><div><div className="eyebrow">SALES</div><h1 className="page-title">Goods invoices</h1><p className="page-desc">Review, issue and download your goods sales invoices.</p></div><Link className="primary-btn" href="/invoices/new">+ Create invoice</Link></div>
 {notices.error&&<div className="form-alert error">{notices.error}</div>}{notices.success&&<div className="form-alert success">{notices.success}</div>}
 <section className="module-card"><div className="panel-head"><div><div className="panel-title">Invoice register</div><div className="panel-hint">Latest 100 records</div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><form action={issueAllDraftInvoices}><button className="secondary-btn" type="submit">Issue all draft invoices</button></form><a className="primary-btn" href="/api/invoices/download-all">Download all invoices ↓</a></div></div>
 {invoices?.length?<div className="table-wrap"><table><thead><tr><th>Invoice no.</th><th>Date</th><th>Customer</th><th>Financial year</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td><strong>{i.invoice_number}</strong></td><td>{new Date(i.invoice_date+"T00:00:00").toLocaleDateString("en-IN")}</td><td>{String((i.buyer_snapshot as Record<string,unknown>)?.legal_name||"—")}</td><td>{i.financial_year}</td><td>₹{Number(i.grand_total).toLocaleString("en-IN",{minimumFractionDigits:2})}</td><td><span className={"status "+(["issued","irp_registered"].includes(i.status)?"registered":i.status==="irp_failed"?"failed":"pending")}>{i.status.replaceAll("_"," ")}</span></td><td><Link className="text-action" href={"/invoices/"+i.id}>View</Link></td></tr>)}</tbody></table></div>:<div className="empty">No invoices created yet. Start with your first goods sales invoice.</div>}
 </section></main></div>;
}
