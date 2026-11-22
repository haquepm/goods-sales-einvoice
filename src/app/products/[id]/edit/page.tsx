import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProduct } from "../../actions";

export const dynamic = "force-dynamic";

type Search = { error?: string };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: businesses } = await supabase.from("businesses").select("id").order("created_at", { ascending: true }).limit(1);
  if (!businesses?.[0]) redirect("/onboarding");
  const { data: product, error } = await supabase.from("products").select("id,sku,description,hsn_code,unit_code,gst_rate,default_rate").eq("id", id).eq("business_id", businesses[0].id).single();
  if (error || !product) notFound();

  return <div className="module-page">
    <header className="module-header"><Link className="module-brand" href="/app"><span className="brand-mark">GI</span> Goods Invoice</Link><Link className="back-link" href="/products">← Products</Link></header>
    <main className="module-content">
      <div className="module-topline"><div><div className="eyebrow">MASTER DATA</div><h1 className="page-title">Edit product</h1><p className="page-desc">Update product details, tax classification and default selling rate.</p></div></div>
      {query.error && <div className="form-alert error">{query.error}</div>}
      <section className="module-card" style={{maxWidth:680}}>
        <form action={updateProduct} className="data-form">
          <input type="hidden" name="id" value={product.id}/>
          <div className="field"><label>Description *</label><input name="description" required maxLength={240} defaultValue={product.description}/></div>
          <div className="form-grid"><div className="field"><label>SKU / code</label><input name="sku" maxLength={50} defaultValue={product.sku || ""}/></div><div className="field"><label>HSN code *</label><input name="hsn_code" required minLength={4} maxLength={8} defaultValue={product.hsn_code}/></div></div>
          <div className="form-grid"><div className="field"><label>Unit *</label><input name="unit_code" required maxLength={8} defaultValue={product.unit_code}/></div><div className="field"><label>GST rate (%) *</label><input name="gst_rate" type="number" required min="0" max="100" step="0.01" defaultValue={String(product.gst_rate)}/></div></div>
          <div className="field"><label>Default selling rate (₹) *</label><input name="default_rate" type="number" required min="0" step="0.01" defaultValue={String(product.default_rate)}/></div>
          <div className="invoice-detail-actions"><button className="primary-btn" type="submit">Save changes</button><Link className="secondary-btn" href="/products">Cancel</Link></div>
        </form>
      </section>
    </main>
  </div>;
}
