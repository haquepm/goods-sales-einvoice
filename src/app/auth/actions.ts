"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const message = (value: string) => encodeURIComponent(value.slice(0, 180));

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=" + message("Enter your email and password."));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=" + message(error.message));
  redirect("/app");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) redirect("/login?error=" + message("Enter a valid email and a password with at least 8 characters."));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/callback` },
  });
  if (error) redirect("/login?error=" + message(error.message));
  if (data.session) redirect("/onboarding");
  redirect("/login?message=" + message("Check your email to confirm your account, then sign in."));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
