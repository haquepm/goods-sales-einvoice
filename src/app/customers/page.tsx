import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCustomer, toggleCustomerStatus } from "./actions";

export const dynamic = "force-dynamic";

type Search = { error?: string; success?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: businesses } = await supabase.from("businesses").select("id,legal_name,trade_name").order("created_at", { ascending: true }).limit(1);
  if (!businesses?.length) redirect("/onboarding");
  const business = businesses[0];
  const { data: customers, error } = await supabase.from("customers").select("id,customer_code,legal_name,trade_name,gstin,email,phone,state_code,is_active,created_at").eq("business_id", business.id).order("legal_name");
  if (error) throw new Error("Unable to load customers.");
  return <div className="module-page">
    <header className="module-header"><Link className="module-brand" href="/app"><span className="brand-mark">GI</span> Goods Invoice</Link><Link className="back-link" href="/app">← Workspace</Link></header>
    <main className="module-content">
      <div className="module-topline"><div><div className="eyebrow">MASTER DATA</div><h1 className="page-title">Customers</h1><p className="page-desc">Maintain buyer details used in your goods sales invoices.</p></div><span className="count-pill">{customers?.length || 0} customers</span></div>
      {params.error && <div className="form-alert error">{params.error}</div>}{params.success && <div className="form-alert success">{params.success}</div>}
      <div className="module-columns">
        <section className="module-card"><div className="panel-kicker">ADD CUSTOMER</div><h2 className="module-card-title">Customer details</h2>
          <form action={createCustomer} className="data-form">
            <div className="field"><label>Legal name *</label><input name="legal_name" required maxLength={180} placeholder="Customer / company name"/></div>
            <div className="form-grid"><div className="field"><label>Customer code</label><input name="customer_code" placeholder="CUS-001"/></div><div className="field"><label>Trade name</label><input name="trade_name" placeholder="Optional"/></div></div>
            <div className="field"><label>GSTIN</label><input name="gstin" maxLength={15} placeholder="15-character GSTIN"/></div>
            <div className="form-grid"><div className="field"><label>Email</label><input name="email" type="email" placeholder="accounts@example.com"/></div><div className="field"><label>Phone</label><input name="phone" type="tel" placeholder="Mobile / landline"/></div></div>
            <div className="field"><label>Billing address</label><input name="address" placeholder="Building, street, locality"/></div>
            <div className="form-grid"><div className="field"><label>City</label><input name="city"/></div><div className="field"><label>State code</label><input name="state_code" maxLength={2} placeholder="e.g. 32"/></div></div>
            <div className="field"><label>PIN code</label><input name="pincode" maxLength={10}/></div>
            <button className="primary-btn form-button" type="submit">Save customer</button>
          </form>
        </section>
        <section className="module-card"><div className="panel-head"><div className="panel-title">Customer directory</div><div className="panel-hint">This business only</div></div>
          {customers?.length ? <div className="table-wrap"><table><thead><tr><th>Customer</th><th>GSTIN</th><th>Contact</th><th>Status</th><th></th></tr></thead><tbody>{customers.map((c)=><tr key={c.id}><td><strong>{c.legal_name}</strong><div className="table-sub">{c.customer_code || c.trade_name || "—"}</div></td><td>{c.gstin || "Unregistered"}</td><td>{c.email || c.phone || "—"}</td><td><span className={c.is_active ? "status registered" : "status failed"}>{c.is_active ? "Active" : "Inactive"}</span></td><td><form action={toggleCustomerStatus}><input type="hidden" name="id" value={c.id}/><input type="hidden" name="active" value={String(!c.is_active)}/><button className="text-action" type="submit">{c.is_active ? "Deactivate" : "Activate"}</button></form></td></tr>)}</tbody></table></div> : <div className="empty">No customers yet. Add your first customer using the form.</div>}
        </section>
      </div>
    </main>
  </div>;
}
