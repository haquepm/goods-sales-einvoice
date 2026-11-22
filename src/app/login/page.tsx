import { signIn, signUp } from "@/app/auth/actions";

type Props = { searchParams: Promise<{ error?: string; message?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  return <main className="auth-page"><section className="auth-card">
    <div className="brand-mark auth-mark">GI</div><div className="eyebrow">GOODS SALES E-INVOICE</div>
    <h1 className="auth-title">Your invoicing, in one place.</h1>
    <p className="auth-copy">Sign in to your secure business workspace, or create an account to get started.</p>
    {params.error && <div className="form-alert error">{params.error}</div>}
    {params.message && <div className="form-alert success">{params.message}</div>}
    <form className="auth-form" action={signIn}>
      <label htmlFor="login-email">Email address</label><input id="login-email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
      <label htmlFor="login-password">Password</label><input id="login-password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required />
      <button className="primary-btn auth-submit" type="submit">Sign in</button>
    </form>
    <div className="auth-divider"><span>NEW TO GOODS INVOICE?</span></div>
    <form className="auth-form" action={signUp}>
      <label htmlFor="signup-email">Create account with email</label><input id="signup-email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
      <label htmlFor="signup-password">Create password</label><input id="signup-password" name="password" type="password" minLength={8} autoComplete="new-password" placeholder="At least 8 characters" required />
      <button className="secondary-btn auth-submit" type="submit">Create account</button>
    </form>
    <p className="auth-foot">Protected by Supabase authentication · Business data is isolated by workspace.</p>
  </section></main>;
}
