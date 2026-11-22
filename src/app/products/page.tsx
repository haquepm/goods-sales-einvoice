import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createProduct, toggleProductStatus } from "./actions";

export const dynamic = "force-dynamic";

type Search = { error?: string; success?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: businesses } = await supabase.from("businesses").select("id,legal_name,trade_name").order("created_at", { ascending: true }).limit(1);
  if (!businesses?.length) redirect("/onboarding");
  const business = businesses[0];
  const { data: products, error } = await supabase.from("products").select("id,sku,description,hsn_code,unit_code,gst_rate,default_rate,is_active,created_at").eq("business_id", business.id).order("description");
  if (error) throw new Error("Unable to load products.");
  return <div className="module-page">
    <header className="module-header"><Link className="module-brand" href="/app"><span className="brand-mark">GI</span> Goods Invoice</Link><Link className="back-link" href="/app">← Workspace</Link></header>
    <main className="module-content">
      <div className="module-topline"><div><div className="eyebrow">MASTER DATA</div><h1 className="page-title">Products & materials</h1><p className="page-desc">Set up HSN codes, units, GST rates and default selling rates.</p></div><span className="count-pill">{products?.length || 0} products</span></div>
      {params.error && <div className="form-alert error">{params.error}</div>}{params.success && <div className="form-alert success">{params.success}</div>}
      <div className="module-columns">
        <section className="module-card"><div className="panel-kicker">ADD PRODUCT / MATERIAL</div><h2 className="module-card-title">Product details</h2>
          <form action={createProduct} className="data-form">
            <div className="field"><label>Description *</label><input name="description" required maxLength={240} placeholder="e.g. M-Sand"/></div>
            <div className="form-grid"><div className="field"><label>SKU / code</label><input name="sku" placeholder="MAT-001"/></div><div className="field"><label>HSN code *</label><input name="hsn_code" required minLength={4} maxLength={8} placeholder="8-digit HSN"/></div></div>
            <div className="form-grid"><div className="field"><label>Unit *</label><input name="unit_code" required defaultValue="TON" placeholder="TON / KGS / NOS"/></div><div className="field"><label>GST rate (%) *</label><input name="gst_rate" type="number" required min="0" max="100" step="0.01" defaultValue="5"/></div></div>
            <div className="field"><label>Default selling rate (₹) *</label><input name="default_rate" type="number" required min="0" step="0.01" defaultValue="0"/></div>
            <button className="primary-btn form-button" type="submit">Save product</button>
          </form>
        </section>
        <section className="module-card"><div className="panel-head"><div className="panel-title">Product directory</div><div className="panel-hint">This business only</div></div>
          {products?.length ? <div className="table-wrap"><table><thead><tr><th>Product / material</th><th>HSN</th><th>Unit</th><th>GST</th><th>Rate</th><th>Status</th><th>Actions</th></tr></thead><tbody>{products.map((p)=><tr key={p.id}><td><strong>{p.description}</strong><div className="table-sub">{p.sku || "—"}</div></td><td>{p.hsn_code}</td><td>{p.unit_code}</td><td>{Number(p.gst_rate).toFixed(2)}%</td><td>₹{Number(p.default_rate).toLocaleString("en-IN",{minimumFractionDigits:2})}</td><td><span className={p.is_active ? "status registered" : "status failed"}>{p.is_active ? "Active" : "Inactive"}</span></td><td><div className="product-row-actions"><Link className="text-action" href={`/products/${p.id}/edit`}>Edit</Link><form action={toggleProductStatus}><input type="hidden" name="id" value={p.id}/><input type="hidden" name="active" value={String(!p.is_active)}/><button className="text-action" type="submit">{p.is_active ? "Deactivate" : "Activate"}</button></form></div></td></tr>)}</tbody></table></div> : <div className="empty">No products yet. Add your first product or material using the form.</div>}
        </section>
      </div>
    </main>
  </div>;
}
