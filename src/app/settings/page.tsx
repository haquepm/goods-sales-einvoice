import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveBankAccount, saveBusinessProfile, uploadSealSignature } from "./actions";

export const dynamic = "force-dynamic";
type Search = { error?: string; success?: string };
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: businesses } = await supabase.from("businesses").select("id,legal_name,trade_name").order("created_at", { ascending: true }).limit(1);
  if (!businesses?.[0]) redirect("/onboarding");
  const business = businesses[0];
  const [{ data: gst }, { data: banks }, { data: sealPreview }] = await Promise.all([
    supabase.from("business_gst_settings").select("*").eq("business_id", business.id).maybeSingle(),
    supabase.from("business_bank_accounts").select("*").eq("business_id", business.id).order("is_default", { ascending: false }).order("created_at", { ascending: false }),
    supabase.storage.from("invoice-assets").createSignedUrl(`${business.id}/seal-signature.png`, 3600)
  ]);
  return <div className="module-page">
    <header className="module-header"><Link className="module-brand" href="/app"><span className="brand-mark">GI</span> Goods Invoice</Link><Link className="back-link" href="/app">← Workspace</Link></header>
    <main className="module-content">
      <div className="eyebrow">WORKSPACE CONFIGURATION</div><h1 className="page-title">Business settings</h1><p className="page-desc">Maintain seller details and bank information printed on your invoices.</p>
      {params.error && <div className="form-alert error">{params.error}</div>}{params.success && <div className="form-alert success">{params.success}</div>}
      <div className="module-columns">
        <section className="module-card"><div className="panel-kicker">SELLER / GST PROFILE</div><form action={saveBusinessProfile} className="data-form">
          <div className="field"><label>Legal business name *</label><input name="legal_name" required defaultValue={gst?.legal_name || business.legal_name}/></div>
          <div className="field"><label>Trade name</label><input name="trade_name" defaultValue={business.trade_name || ""}/></div>
          <div className="field"><label>GSTIN</label><input name="gstin" maxLength={15} defaultValue={gst?.gstin || ""}/></div>
          <div className="field"><label>MSME / Udyam Registration Number</label><input name="msme_number" defaultValue={gst?.msme_number || ""}/></div>
          <div className="field"><label>Address line 1</label><input name="address_line_1" defaultValue={gst?.address_line_1 || ""}/></div>
          <div className="field"><label>Address line 2</label><input name="address_line_2" defaultValue={gst?.address_line_2 || ""}/></div>
          <div className="form-grid"><div className="field"><label>City</label><input name="city" defaultValue={gst?.city || ""}/></div><div className="field"><label>District</label><input name="district" defaultValue={gst?.district || ""}/></div></div>
          <div className="form-grid"><div className="field"><label>State</label><input name="state_name" defaultValue={gst?.state_name || ""}/></div><div className="field"><label>GST state code</label><input name="state_code" maxLength={2} defaultValue={gst?.state_code || ""}/></div></div>
          <div className="form-grid"><div className="field"><label>PIN code</label><input name="postal_code" maxLength={6} defaultValue={gst?.postal_code || ""}/></div><div className="field"><label>Phone</label><input name="phone" defaultValue={gst?.phone || ""}/></div></div>
          <div className="field"><label>Email</label><input name="email" type="email" defaultValue={gst?.email || ""}/></div>
          <button className="primary-btn form-button" type="submit">Save business profile</button>
        </form></section>
        <section className="module-card"><div className="panel-kicker">INVOICE SEAL & SIGNATURE</div><h2 className="module-card-title">Upload company seal and authorised signature</h2>
          <p className="line-meta">Upload one transparent PNG. It will be placed in the authorised signatory area of every newly generated invoice PDF.</p>
          {sealPreview?.signedUrl && <div style={{margin:"12px 0",padding:12,border:"1px solid #e5e7eb",borderRadius:8,background:"#fff"}}><img src={sealPreview.signedUrl} alt="Current company seal and signature" style={{maxWidth:220,maxHeight:120,objectFit:"contain"}}/><p className="line-meta">Current seal and signature</p></div>}
          <form action={uploadSealSignature} encType="multipart/form-data" className="data-form">
            <div className="field"><label>Seal & signature PNG *</label><input type="file" name="seal_signature" accept="image/png,.png" required/></div>
            <button className="primary-btn form-button" type="submit">Upload seal & signature</button>
          </form>
        </section>
        <section className="module-card"><div className="panel-kicker">BANK DETAILS</div><h2 className="module-card-title">Invoice payment details</h2>
          {banks?.map(bank=><div className="bank-summary" key={bank.id}><strong>{bank.bank_name}</strong><p>{bank.account_holder_name} · A/c ending {String(bank.account_number).slice(-4)}</p><p>IFSC: {bank.ifsc_code} · {bank.branch_name || ""}</p>{bank.is_default && <span className="setup-chip">Default account</span>}</div>)}
          <form action={saveBankAccount} className="data-form">
            <div className="field"><label>Account holder name *</label><input name="account_holder_name" required/></div>
            <div className="field"><label>Bank name *</label><input name="bank_name" required/></div>
            <div className="field"><label>Account number *</label><input name="account_number" required inputMode="numeric"/></div>
            <div className="field"><label>IFSC *</label><input name="ifsc_code" required maxLength={11}/></div>
            <div className="field"><label>Branch</label><input name="branch_name"/></div>
            <button className="primary-btn form-button" type="submit">Add as default bank account</button>
          </form>
          <p className="line-meta">Bank account details are visible only to members of this business workspace.</p>
        </section>
      </div>
    </main>
  </div>;
}
