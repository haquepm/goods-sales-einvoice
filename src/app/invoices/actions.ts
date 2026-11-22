"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  customer_id: z.string().uuid(),
  invoice_date: z.string().date(),
  supply_type: z.enum(["B2B","B2C","EXP","SEZ","DEXP"]),
  product_id: z.string().uuid(),
  quantity: z.coerce.number().positive().max(999999999),
  unit_rate: z.coerce.number().min(0).max(999999999),
  discount_amount: z.coerce.number().min(0).max(999999999),
});

export async function createDraftInvoice(formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/invoices/new?error=Please%20complete%20all%20required%20fields");
  const { data: businesses, error: businessError } = await supabase.from("businesses").select("id").order("created_at",{ascending:true}).limit(1);
  if (businessError || !businesses?.[0]) redirect("/onboarding");
  const v=parsed.data;
  const { data: invoiceId, error } = await supabase.rpc("create_goods_invoice_draft",{
    p_business_id: businesses[0].id,
    p_customer_id: v.customer_id,
    p_invoice_date: v.invoice_date,
    p_supply_type: v.supply_type,
    p_items: [{product_id:v.product_id,quantity:v.quantity,unit_rate:v.unit_rate,discount_amount:v.discount_amount}],
    p_delivery_details: {},
    p_transport_details: {},
  });
  if (error || !invoiceId) redirect("/invoices/new?error="+encodeURIComponent(error?.message || "Unable to create draft invoice"));
  revalidatePath("/invoices");
  redirect("/invoices/"+invoiceId);
}
