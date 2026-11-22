"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const productSchema = z.object({
  sku: z.string().trim().max(50).optional(),
  description: z.string().trim().min(2).max(240),
  hsn_code: z.string().trim().min(4).max(8),
  unit_code: z.string().trim().min(1).max(8).transform((v) => v.toUpperCase()),
  gst_rate: z.coerce.number().min(0).max(100),
  default_rate: z.coerce.number().min(0).max(999999999),
});

export async function createProduct(formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/products?error=Please%20check%20the%20product%20details");
  const { data: businesses, error: businessError } = await supabase.from("businesses").select("id").order("created_at", { ascending: true }).limit(1);
  if (businessError || !businesses?.[0]) redirect("/onboarding");
  const value = parsed.data;
  const { error } = await supabase.from("products").insert({
    business_id: businesses[0].id,
    sku: value.sku || null,
    description: value.description,
    hsn_code: value.hsn_code,
    unit_code: value.unit_code,
    gst_rate: value.gst_rate,
    default_rate: value.default_rate,
  });
  if (error) redirect("/products?error=Unable%20to%20save%20product.%20Check%20duplicate%20SKU.");
  revalidatePath("/products");
  revalidatePath("/app");
  redirect("/products?success=Product%20added");
}

export async function updateProduct(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/products?error=Invalid%20product");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/products/${id}/edit?error=Please%20check%20the%20product%20details`);
  const { data: businesses, error: businessError } = await supabase.from("businesses").select("id").order("created_at", { ascending: true }).limit(1);
  if (businessError || !businesses?.[0]) redirect("/onboarding");
  const value = parsed.data;
  const { error } = await supabase.from("products").update({
    sku: value.sku || null,
    description: value.description,
    hsn_code: value.hsn_code,
    unit_code: value.unit_code,
    gst_rate: value.gst_rate,
    default_rate: value.default_rate,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_id", businesses[0].id);
  if (error) redirect(`/products/${id}/edit?error=Unable%20to%20update%20product.%20Check%20duplicate%20SKU.`);
  revalidatePath("/products");
  revalidatePath("/invoices/new");
  revalidatePath("/imports");
  redirect("/products?success=Product%20updated");
}

export async function toggleProductStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const active = String(formData.get("active") || "") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/products?error=Invalid%20product");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: businesses } = await supabase.from("businesses").select("id").order("created_at", { ascending: true }).limit(1);
  if (!businesses?.[0]) redirect("/onboarding");
  const { error } = await supabase.from("products").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", businesses[0].id);
  if (error) redirect("/products?error=Unable%20to%20update%20product");
  revalidatePath("/products");
  redirect("/products?success=Product%20updated");
}
