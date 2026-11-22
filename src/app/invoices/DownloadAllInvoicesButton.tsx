"use client";

import { useState } from "react";

type Phase = "idle" | "generating" | "downloading" | "done" | "error";

export default function DownloadAllInvoicesButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  async function downloadAll() {
    if (phase === "generating" || phase === "downloading") return;
    setPhase("generating");
    setMessage("Generating invoice PDFs and preparing your ZIP file. Please keep this page open...");
    try {
      const response = await fetch("/api/invoices/download-all", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        let reason = "Unable to generate the invoice ZIP.";
        try {
          const body = await response.json();
          if (body?.error) reason = body.error;
        } catch {}
        throw new Error(reason);
      }
      const type = response.headers.get("content-type") || "";
      if (!type.includes("application/zip")) {
        throw new Error("The server did not return a ZIP file. Please try again.");
      }
      setPhase("downloading");
      setMessage("ZIP generated successfully. Starting download...");
      const blob = await response.blob();
      if (!blob.size) throw new Error("The generated ZIP file is empty.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "all-goods-invoices.zip";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const count = response.headers.get("x-invoice-pdf-count");
      const skipped = response.headers.get("x-invoice-pdf-skipped");
      setPhase("done");
      setMessage(`Download started: ${count || "All"} invoice PDF(s) in ZIP.${skipped && Number(skipped) > 0 ? ` ${skipped} invoice(s) could not be generated and were skipped.` : ""}`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Download failed. Please try again.");
    }
  }

  const busy = phase === "generating" || phase === "downloading";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6,minWidth:190}}>
      <button type="button" className="primary-btn" onClick={downloadAll} disabled={busy}>
        {phase === "generating" ? "Generating ZIP..." : phase === "downloading" ? "Starting download..." : "Download all invoices ↓"}
      </button>
      {message && <div role="status" aria-live="polite" style={{fontSize:12,lineHeight:1.4,color:phase==="error"?"#b42318":phase==="done"?"#067647":"#475467",maxWidth:280}}>{busy && <span aria-hidden="true">⏳ </span>}{message}</div>}
    </div>
  );
}
