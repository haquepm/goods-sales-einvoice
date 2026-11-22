"use client";

import { useFormStatus } from "react-dom";

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return <button className="primary-btn" type="submit" disabled={pending} aria-live="polite">
    {pending ? "Generating invoices… Please keep this page open" : `Generate ${count} draft invoices →`}
  </button>;
}

export function GenerateBatchButton({ count }: { count: number }) {
  return <SubmitButton count={count} />;
}
