import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Goods Sales e-Invoice",
  description: "Multi-business GST goods sales e-Invoice management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
