import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { issueInvoice } from "../actions";

export const dynamic="force-dynamic";
export default async function InvoiceDetailPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;success?:string}>}){
 const notices=await searchParams;
 const {id}=await params;
 const supabase=await createClient();
 const {data:claims}=await supabase.auth.getClaims();
 if(!claims?.claims?.sub) redirect("/login");
 const {data:businesses}=await supabase.from("businesses").select("id").order("created_at",{ascending:true}).limit(1);
 if(!businesses?.length) redirect("/onboarding");
 const {data:invoice,error}=await supabase.from("goods_invoices").select("*").eq("id",id).eq("business_id",businesses[0].id).maybeSingle();
 if(error||!invoice) notFound();
 const {data:items}=await supabase.from("goods_invoice_items").select("*").eq("invoice_id",id).order("line_number");
 const seller=invoice.seller_snapshot as Record<string,string>;
 const buyer=invoice.buyer_snapshot as Record<string,string>;
 return <div className="invoice-page"><header className="module-header"><Link className="module-brand" href="/app"><span className="brand-mark">GI</span> Goods Invoice</Link><Link className="back-link" href="/invoices">← Invoice register</Link></header>
 <main className="invoice-content">{notices.error&&<div className="form-alert error">{notices.error}</div>}{notices.success&&<div className="form-alert success">{notices.success}</div>}<div className="invoice-actions"><div><div className="eyebrow">DRAFT / REGISTER</div><h1 className="page-title">{invoice.invoice_number}</h1><p className="page-desc">{new Date(invoice.invoice_date+"T00:00:00").toLocaleDateString("en-IN")} · {invoice.financial_year}</p></div><div className="invoice-detail-actions"><span className={"status "+(["issued","irp_registered"].includes(invoice.status)?"registered":"pending")}>{invoice.status.replaceAll("_"," ")}</span>{invoice.status==="draft"&&<form action={issueInvoice}><input type="hidden" name="invoice_id" value={invoice.id}/><button className="secondary-btn" type="submit">Issue invoice</button></form>}<a className="primary-btn" href={"/api/invoices/"+invoice.id+"/pdf"} download>Download PDF ↓</a></div></div>
 <section className="invoice-paper"><div className="invoice-paper-title">{invoice.status==="draft"?"DRAFT INVOICE":"TAX INVOICE"}</div><div className="irp-block"><strong>IRN</strong><p>{invoice.generated_irn}</p></div><div className="invoice-parties"><div><div className="panel-kicker">SELLER</div><strong>{seller.legal_name}</strong><p>{seller.address_line_1} {seller.address_line_2}<br/>{seller.city} {seller.postal_code}<br/>GSTIN: {seller.gstin}</p></div><div><div className="panel-kicker">BILL TO</div><strong>{buyer.legal_name}</strong><p>{buyer.gstin?"GSTIN: "+buyer.gstin:"Unregistered customer"}<br/>State code: {buyer.state_code}</p></div></div>
 <div className="table-wrap"><table className="invoice-lines"><thead><tr><th>#</th><th>Description</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>GST</th><th>Total</th></tr></thead><tbody>{(items||[]).map(x=><tr key={x.id}><td>{x.line_number}</td><td>{x.description}<div className="table-sub">{x.unit_code}</div></td><td>{x.hsn_code}</td><td>{Number(x.quantity).toLocaleString("en-IN")}</td><td>{Number(x.unit_rate).toFixed(2)}</td><td>{Number(x.taxable_value).toFixed(2)}</td><td>{Number(x.gst_rate).toFixed(2)}%</td><td>{Number(x.line_total).toFixed(2)}</td></tr>)}</tbody></table></div>
 <div className="invoice-total"><div><span>Taxable value</span><strong>₹{Number(invoice.subtotal).toFixed(2)}</strong></div><div><span>CGST</span><strong>₹{Number(invoice.cgst_total).toFixed(2)}</strong></div><div><span>SGST</span><strong>₹{Number(invoice.sgst_total).toFixed(2)}</strong></div><div><span>IGST</span><strong>₹{Number(invoice.igst_total).toFixed(2)}</strong></div><div className="grand"><span>Grand total</span><strong>₹{Number(invoice.grand_total).toLocaleString("en-IN",{minimumFractionDigits:2})}</strong></div></div>
 {invoice.status==="irp_registered"&&invoice.irn?<div className="irp-block"><strong>IRP Registration IRN</strong><p>{invoice.irn}</p><strong>Acknowledgement no.</strong><p>{invoice.acknowledgement_number}</p></div>:<div className="invoice-note">{invoice.status==="draft"?"This invoice is a draft. Issue it when the details have been reviewed.":"Invoice issued and saved. The generated 64-character invoice reference is shown above."}</div>}
 </section></main></div>;
}
