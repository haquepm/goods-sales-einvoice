import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: businesses, error } = await supabase.from("businesses")
    .select("id, legal_name, trade_name, created_at").order("created_at", { ascending: true });
  if (error) throw new Error("Unable to load business workspaces.");
  if (!businesses?.length) redirect("/onboarding");
  const business = businesses[0];
  const email = typeof claims.claims.email === "string" ? claims.claims.email : "Signed-in user";
  return <div className="workspace-page">
    <header className="workspace-header"><a className="workspace-brand" href="/app"><span className="brand-mark">GI</span><span>Goods Invoice</span></a>
      <div className="workspace-user"><span>{email}</span><form action={signOut}><button className="signout-btn" type="submit">Sign out</button></form></div>
    </header>
    <main className="workspace-content"><div className="eyebrow">BUSINESS WORKSPACE</div>
      <h1 className="page-title">{business.trade_name || business.legal_name}</h1>
      <p className="page-desc">Your secure goods sales invoicing workspace is ready.</p>
      <div className="workspace-grid">
        <section className="workspace-panel"><div className="panel-kicker">SETUP STATUS</div><h2>Business profile created</h2><p>Your account is the owner of this workspace. GST registration and address details can be reviewed in Settings.</p><span className="setup-chip">Workspace active</span></section>
        <section className="workspace-panel"><div className="panel-kicker">MASTER DATA</div><h2>Customer master</h2><p>Maintain buyer names, GSTIN, billing address and contact details for accurate invoices.</p><a className="module-link" href="/customers">Open customers →</a></section><section className="workspace-panel"><div className="panel-kicker">MASTER DATA</div><h2>Products & materials</h2><p>Maintain goods descriptions, HSN codes, units, GST rates and default selling rates.</p><a className="module-link" href="/products">Open products →</a></section>
        <section className="workspace-panel"><div className="panel-kicker">SALES</div><h2>Goods invoices</h2><p>Create goods sales invoices, review GST calculations and download invoice PDFs.</p><a className="module-link" href="/invoices">Open invoice register →</a></section><section className="workspace-panel"><div className="panel-kicker">BULK OPERATIONS</div><h2>Excel invoice import</h2><p>Preview dispatch sheets, skip empty rows and generate individual draft invoices for each valid entry.</p><a className="module-link" href="/imports">Open Excel import →</a></section>
      </div>
    </main>
  </div>;
}
