import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createBusiness } from "./actions";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function OnboardingPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: businesses } = await supabase.from("businesses").select("id").limit(1);
  if (businesses?.length) redirect("/app");
  const params = await searchParams;
  return <main className="auth-page onboarding-page"><section className="onboarding-card">
    <div className="eyebrow">STEP 1 · BUSINESS PROFILE</div><h1 className="auth-title">Set up your business</h1>
    <p className="auth-copy">This creates your private workspace. You will be assigned as its owner automatically.</p>
    {params.error && <div className="form-alert error">{params.error}</div>}
    <form action={createBusiness} className="business-form">
      <div className="form-section-title">Business identity</div><div className="form-grid">
        <div className="field full"><label htmlFor="legal_name">Legal business name *</label><input id="legal_name" name="legal_name" required /></div>
        <div className="field"><label htmlFor="trade_name">Trade name (optional)</label><input id="trade_name" name="trade_name" /></div>
        <div className="field"><label htmlFor="gstin">GSTIN</label><input id="gstin" name="gstin" maxLength={15} autoCapitalize="characters" /></div>
      </div>
      <div className="form-section-title">Registered address</div><div className="form-grid">
        <div className="field full"><label htmlFor="address_line_1">Address line 1</label><input id="address_line_1" name="address_line_1" /></div>
        <div className="field full"><label htmlFor="address_line_2">Address line 2</label><input id="address_line_2" name="address_line_2" /></div>
        <div className="field"><label htmlFor="city">City / Town</label><input id="city" name="city" /></div>
        <div className="field"><label htmlFor="district">District</label><input id="district" name="district" /></div>
        <div className="field"><label htmlFor="state_name">State</label><input id="state_name" name="state_name" defaultValue="Kerala" /></div>
        <div className="field"><label htmlFor="state_code">GST state code</label><input id="state_code" name="state_code" maxLength={2} placeholder="32" /></div>
        <div className="field"><label htmlFor="postal_code">PIN code</label><input id="postal_code" name="postal_code" inputMode="numeric" maxLength={6} /></div>
        <div className="field"><label htmlFor="phone">Business phone</label><input id="phone" name="phone" type="tel" /></div>
        <div className="field full"><label htmlFor="email">Business email</label><input id="email" name="email" type="email" /></div>
      </div>
      <button className="primary-btn auth-submit" type="submit">Create business workspace</button>
    </form>
  </section></main>;
}
