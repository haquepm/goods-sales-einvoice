import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createDraftInvoice } from "../actions";

export const dynamic = "force-dynamic";
type Search={error?:string};

export default async function NewInvoicePage({searchParams}:{searchParams:Promise<Search>}) {
 const params=await searchParams;
 const supabase=await createClient();
 const {data:claims}=await supabase.auth.getClaims();
 if(!claims?.claims?.sub) redirect("/login");
 const {data:businesses}=await supabase.from("businesses").select("id").order("created_at",{ascending:true}).limit(1);
 if(!businesses?.length) redirect("/onboarding");
 const [{data:customers},{data:products},{data:seller}]=await Promise.all([
  supabase.from("customers").select("id,legal_name,gstin,state_code").eq("business_id",businesses[0].id).eq("is_active",true).order("legal_name"),
  supabase.from("products").select("id,description,hsn_code,unit_code,gst_rate,default_rate").eq("business_id",businesses[0].id).eq("is_active",true).order("description"),
  supabase.from("business_gst_settings").select("gstin,state_code,legal_name").eq("business_id",businesses[0].id).maybeSingle()
 ]);
 if(!seller?.gstin || !seller.state_code) return <main className="invoice-page"><header className="module-header"><Link className="module-brand" href="/app">Goods Invoice</Link><Link href="/app">← Workspace</Link></header><section className="invoice-content"><div className="form-alert error">Complete your business GSTIN and state code in the business profile before creating GST invoices.</div></section></main>;
 return <div className="invoice-page"><header className="module-header"><Link className="module-brand" href="/app"><span className="brand-mark">GI</span> Goods Invoice</Link><Link className="back-link" href="/invoices">← Invoices</Link></header>
 <main className="invoice-content"><div className="eyebrow">SALES / GOODS</div><h1 className="page-title">Create invoice</h1><p className="page-desc">Create a draft. Invoice number allocation and tax calculation are handled atomically by the database.</p>
 {params.error&&<div className="form-alert error">{params.error}</div>}
 {!customers?.length||!products?.length?<div className="module-card invoice-warning">{!customers?.length&&<p>Add at least one active customer in Customer Master.</p>}{!products?.length&&<p>Add at least one active product in Product Master.</p>}<Link className="module-link" href={!customers?.length?"/customers":"/products"}>Open master data →</Link></div>:
 <form action={createDraftInvoice} className="module-card invoice-form">
 <div className="panel-kicker">INVOICE DETAILS</div><div className="form-grid">
 <div className="field"><label>Customer *</label><select name="customer_id" required defaultValue=""><option value="" disabled>Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.legal_name}{c.gstin?" · "+c.gstin:""}</option>)}</select></div>
 <div className="field"><label>Invoice date *</label><input name="invoice_date" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></div>
 <div className="field"><label>Supply type *</label><select name="supply_type" defaultValue="B2B"><option value="B2B">B2B</option><option value="B2C">B2C</option><option value="EXP">Export</option><option value="SEZ">SEZ</option><option value="DEXP">Deemed export</option></select></div>
 </div>
 <div className="form-divider"></div><div className="panel-kicker">GOODS / MATERIAL</div>
 <div className="field"><label>Product *</label><select name="product_id" required defaultValue=""><option value="" disabled>Select product / material</option>{products.map(p=><option key={p.id} value={p.id}>{p.description} · HSN {p.hsn_code} · {p.gst_rate}% GST</option>)}</select></div>
 <div className="form-grid">
 <div className="field"><label>Quantity *</label><input name="quantity" type="number" min="0.001" step="0.001" required defaultValue="1"/></div>
 <div className="field"><label>Unit rate (₹) *</label><input name="unit_rate" type="number" min="0" step="0.01" required defaultValue="0"/></div>
 <div className="field"><label>Discount amount (₹)</label><input name="discount_amount" type="number" min="0" step="0.01" defaultValue="0"/></div>
 </div>
 <div className="invoice-note">GST is calculated using the product master rate and seller/customer state codes. The database creates the invoice and its line item in one transaction, with a unique financial-year sequence.</div>
 <button className="primary-btn form-button" type="submit">Save draft invoice →</button>
 </form>}
 </main></div>;
}
