import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PDFKit resolves its standard AFM fonts relative to its package directory.
  // Keep it external so Vercel includes the package assets in the server function.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/invoices/[id]/pdf": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
