"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createBusiness(formData: FormData) {
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const gstin = String(formData.get("gstin") ?? "").trim().toUpperCase();
  if (!legalName) redirect("/onboarding?error=Enter%20the%20legal%20business%20name.");
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    redirect("/onboarding?error=Enter%20a%20valid%20GSTIN%20or%20leave%20it%20blank.");
  }
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims?.claims?.sub) redirect("/login");
  const { error } = await supabase.rpc("create_business_with_gst_profile", {
    p_legal_name: legalName,
    p_trade_name: String(formData.get("trade_name") ?? "").trim(),
    p_gstin: gstin,
    p_address_line_1: String(formData.get("address_line_1") ?? "").trim(),
    p_address_line_2: String(formData.get("address_line_2") ?? "").trim(),
    p_city: String(formData.get("city") ?? "").trim(),
    p_district: String(formData.get("district") ?? "").trim(),
    p_state_name: String(formData.get("state_name") ?? "").trim(),
    p_state_code: String(formData.get("state_code") ?? "").trim(),
    p_postal_code: String(formData.get("postal_code") ?? "").trim(),
    p_email: String(formData.get("email") ?? "").trim(),
    p_phone: String(formData.get("phone") ?? "").trim(),
  });
  if (error) redirect("/onboarding?error=" + encodeURIComponent(error.message.slice(0, 160)));
  redirect("/app");
}
