import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deflateRawSync } from "node:zlib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipFiles(files: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name.replace(/[^a-zA-Z0-9._/-]/g, "_"));
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(compressed.length, 18);
    lh.writeUInt32LE(file.data.length, 22); lh.writeUInt16LE(name.length, 26);
    local.push(lh, name, compressed);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(compressed.length, 20); ch.writeUInt32LE(file.data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + compressed.length;
  }
  const centralData = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralData, end]);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data: businesses } = await supabase.from("businesses").select("id").order("created_at", { ascending: true }).limit(1);
  if (!businesses?.[0]) return NextResponse.json({ error: "Business workspace not found" }, { status: 404 });
  const businessId = businesses[0].id;
  const { data: membership } = await supabase.from("business_users").select("role").eq("business_id", businessId).eq("user_id", claims.claims.sub).eq("is_active", true).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });

  const all: { id: string; invoice_number: string }[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from("goods_invoices").select("id,invoice_number")
      .eq("business_id", businessId).order("invoice_date", { ascending: false }).range(from, from + 499);
    if (error) return NextResponse.json({ error: "Unable to load invoice register" }, { status: 500 });
    all.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  if (!all.length) return NextResponse.json({ error: "No invoices available to download" }, { status: 404 });

  const cookie = request.headers.get("cookie") || "";
  const files: { name: string; data: Buffer }[] = [];
  let skipped = 0;
  for (const invoice of all) {
    const response = await fetch(new URL(`/api/invoices/${invoice.id}/pdf`, request.url), {
      headers: { cookie }, cache: "no-store",
    });
    if (!response.ok) { skipped++; continue; }
    const name = String(invoice.invoice_number).replace(/[^a-zA-Z0-9._-]/g, "_") + ".pdf";
    files.push({ name, data: Buffer.from(await response.arrayBuffer()) });
  }
  if (!files.length) return NextResponse.json({ error: "No invoice PDFs could be generated" }, { status: 500 });
  const archive = zipFiles(files);
  return new NextResponse(new Uint8Array(archive), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="all-goods-invoices.zip"',
      "Cache-Control": "private, no-store",
      "Content-Length": String(archive.length),
      "X-Invoice-PDF-Count": String(files.length),
      "X-Invoice-PDF-Skipped": String(skipped),
      "Access-Control-Expose-Headers": "X-Invoice-PDF-Count, X-Invoice-PDF-Skipped",
    },
  });
}
