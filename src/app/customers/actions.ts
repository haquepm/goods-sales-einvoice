"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const customerSchema = z.object({
  customer_code: z.string().trim().max(40).optional(),
  legal_name: z.string().trim().min(2).max(180),
  trade_name: z.string().trim().max(180).optional(),
  gstin: z.string().trim().toUpperCase().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state_code: z.string().trim().max(2).optional(),
  pincode: z.string().trim().max(10).optional(),
});

export async function createCustomer(formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/customers?error=Please%20check%20the%20customer%20details");
  const { data: businesses, error: businessError } = await supabase.from("businesses").select("id").order("created_at", { ascending: true }).limit(1);
  if (businessError || !businesses?.[0]) redirect("/onboarding");
  const value = parsed.data;
  const gstin = value.gstin || null;
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) redirect("/customers?error=GSTIN%20format%20is%20invalid");
  const address = { line1: value.address || "", city: value.city || "", state_code: value.state_code || "", pincode: value.pincode || "" };
  const { error } = await supabase.from("customers").insert({
    business_id: businesses[0].id,
    customer_code: value.customer_code || null,
    legal_name: value.legal_name,
    trade_name: value.trade_name || null,
    gstin,
    email: value.email || null,
    phone: value.phone || null,
    billing_address: address,
    shipping_address: address,
    state_code: value.state_code || (gstin ? gstin.slice(0, 2) : null),
  });
  if (error) redirect("/customers?error=Unable%20to%20save%20customer.%20Check%20duplicate%20code%20or%20GSTIN.");
  revalidatePath("/customers");
  revalidatePath("/app");
  redirect("/customers?success=Customer%20added");
}

export async function toggleCustomerStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const active = String(formData.get("active") || "") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/customers?error=Invalid%20customer");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: businesses } = await supabase.from("businesses").select("id").order("created_at", { ascending: true }).limit(1);
  if (!businesses?.[0]) redirect("/onboarding");
  const { error } = await supabase.from("customers").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", businesses[0].id);
  if (error) redirect("/customers?error=Unable%20to%20update%20customer");
  revalidatePath("/customers");
  redirect("/customers?success=Customer%20updated");
}
