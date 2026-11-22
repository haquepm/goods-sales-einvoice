"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function getWorkspace() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: businesses } = await supabase.from("businesses").select("id").order("created_at", { ascending: true }).limit(1);
  if (!businesses?.[0]) redirect("/onboarding");
  return { supabase, businessId: businesses[0].id };
}

export async function saveBusinessProfile(formData: FormData) {
  const { supabase, businessId } = await getWorkspace();
  const legalName = String(formData.get("legal_name") || "").trim();
  const tradeName = String(formData.get("trade_name") || "").trim();
  const gstin = String(formData.get("gstin") || "").trim().toUpperCase();
  const stateCode = String(formData.get("state_code") || "").trim();
  if (legalName.length < 2) redirect("/settings?error=Enter%20the%20legal%20business%20name");
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) redirect("/settings?error=Enter%20a%20valid%20GSTIN");
  if (stateCode && !/^\d{2}$/.test(stateCode)) redirect("/settings?error=GST%20state%20code%20must%20contain%20two%20digits");
  const { error: businessError } = await supabase.from("businesses").update({ legal_name: legalName, trade_name: tradeName || null, updated_at: new Date().toISOString() }).eq("id", businessId);
  if (businessError) redirect("/settings?error=Unable%20to%20update%20business");
  const { error } = await supabase.from("business_gst_settings").update({
    legal_name: legalName, gstin: gstin || null,
    msme_number: String(formData.get("msme_number") || "").trim() || null,
    address_line_1: String(formData.get("address_line_1") || "").trim() || null,
    address_line_2: String(formData.get("address_line_2") || "").trim() || null,
    city: String(formData.get("city") || "").trim() || null,
    district: String(formData.get("district") || "").trim() || null,
    state_name: String(formData.get("state_name") || "").trim() || null,
    state_code: stateCode || null,
    postal_code: String(formData.get("postal_code") || "").trim() || null,
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    updated_at: new Date().toISOString()
  }).eq("business_id", businessId);
  if (error) redirect("/settings?error=Unable%20to%20save%20GST%20profile");
  revalidatePath("/app"); revalidatePath("/invoices/new"); revalidatePath("/settings");
  redirect("/settings?success=Business%20profile%20saved");
}

export async function saveBankAccount(formData: FormData) {
  const { supabase, businessId } = await getWorkspace();
  const accountHolder = String(formData.get("account_holder_name") || "").trim();
  const bankName = String(formData.get("bank_name") || "").trim();
  const accountNumber = String(formData.get("account_number") || "").trim();
  const ifsc = String(formData.get("ifsc_code") || "").trim().toUpperCase();
  const branch = String(formData.get("branch_name") || "").trim();
  if (!accountHolder || !bankName || !accountNumber || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) redirect("/settings?error=Enter%20valid%20bank%20details%20and%20IFSC");
  const { error: resetError } = await supabase.from("business_bank_accounts").update({ is_default: false }).eq("business_id", businessId);
  if (resetError) redirect("/settings?error=Unable%20to%20update%20bank%20account");
  const { error } = await supabase.from("business_bank_accounts").insert({ business_id: businessId, account_holder_name: accountHolder, bank_name: bankName, account_number: accountNumber, ifsc_code: ifsc, branch_name: branch || null, is_default: true });
  if (error) redirect("/settings?error=Unable%20to%20save%20bank%20account");
  revalidatePath("/settings"); revalidatePath("/api/invoices");
  redirect("/settings?success=Bank%20account%20saved");
}


export async function uploadSealSignature(formData: FormData) {
  const { supabase, businessId } = await getWorkspace();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const { data: membership } = await supabase
    .from("business_users")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    redirect("/settings?error=Only%20business%20owners%20and%20admins%20can%20upload%20the%20seal");
  }
  const file = formData.get("seal_signature");
  if (!(file instanceof File) || file.size === 0) redirect("/settings?error=Select%20a%20PNG%20file");
  if (file.type !== "image/png" || !file.name.toLowerCase().endsWith(".png")) {
    redirect("/settings?error=Only%20PNG%20images%20are%20accepted");
  }
  if (file.size > 2 * 1024 * 1024) redirect("/settings?error=PNG%20must%20be%202MB%20or%20smaller");
  const { error } = await supabase.storage
    .from("invoice-assets")
    .upload(`${businessId}/seal-signature.png`, file, {
      contentType: "image/png",
      upsert: true,
      cacheControl: "3600",
    });
  if (error) redirect("/settings?error=Unable%20to%20upload%20seal%20and%20signature");
  revalidatePath("/settings");
  revalidatePath("/invoices");
  redirect("/settings?success=Seal%20and%20signature%20uploaded");
}
