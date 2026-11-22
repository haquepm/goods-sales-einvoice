import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Database snapshots and PDF layout records are intentionally dynamic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;
const s = (v: unknown) => String(v ?? "").trim();
const n = (v: unknown) => Number(v || 0);
const money = (v: unknown) => n(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v).length === 10 ? String(v) + "T00:00:00" : String(v));
  return Number.isNaN(d.getTime()) ? s(v) : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
};
const address = (v: unknown) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v !== "object") return s(v);
  const x = v as R;
  return [x.line1 || x.address_line_1, x.line2 || x.address_line_2, x.city, x.district, x.state || x.state_name, x.postal_code || x.pincode].filter(Boolean).map(s).join(", ");
};
const smallWords = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tensWords = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function underHundred(n0: number): string {
  const v = Math.floor(n0);
  if (v < 20) return smallWords[v];
  return tensWords[Math.floor(v / 10)] + (v % 10 ? " " + smallWords[v % 10] : "");
}
function amountWords(value: number): string {
  let v = Math.floor(Math.abs(value));
  if (!v) return "Zero";
  const parts: string[] = [];
  for (const [unit, label] of [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"], [1, ""]] as [number, string][]) {
    if (v >= unit) {
      const q = Math.floor(v / unit);
      parts.push(underHundred(q) + (label ? " " + label : ""));
      v %= unit;
    }
  }
  return parts.join(" ");
}
const inrWords = (v: number) => {
  const rupees = Math.floor(Math.abs(v));
  const paise = Math.round((Math.abs(v) - rupees) * 100);
  return "Indian Rupee " + amountWords(rupees) + (paise ? " and " + amountWords(paise) + " paise" : "") + " Only";
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data: businesses } = await supabase.from("businesses").select("id").order("created_at", { ascending: true }).limit(1);
  if (!businesses?.[0]) return NextResponse.json({ error: "Business workspace not found" }, { status: 404 });
  const businessId = businesses[0].id;
  const { data: invoice } = await supabase.from("goods_invoices").select("*").eq("id", id).eq("business_id", businessId).maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const [{ data: items }, { data: bank }] = await Promise.all([
    supabase.from("goods_invoice_items").select("*").eq("invoice_id", id).order("line_number"),
    supabase.from("business_bank_accounts").select("account_holder_name,bank_name,account_number,ifsc_code,branch_name").eq("business_id", businessId).eq("is_default", true).maybeSingle()
  ]);

  const seller = (invoice.seller_snapshot || {}) as R;
  const buyer = (invoice.buyer_snapshot || {}) as R;
  const delivery = (invoice.delivery_details || {}) as R;
  const transport = (invoice.transport_details || {}) as R;
  const rows = (items || []) as R[];

  // A4 portrait, 10 mm margins and 190 mm content width, following the supplied HTML/CSS template.
  const doc = new PDFDocument({ size: "A4", margin: 28.35, bufferPages: true, info: { Title: "Tax Invoice " + invoice.invoice_number } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const L = 28.35, W = 538.3, RIGHT = L + W;
  const ink = "#000000";
  const rule = (y: number, x1 = L, x2 = RIGHT, width = 0.45) => doc.moveTo(x1, y).lineTo(x2, y).lineWidth(width).strokeColor(ink).stroke();
  const box = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h).lineWidth(0.45).strokeColor(ink).stroke();
  const text = (value: unknown, x: number, y: number, w: number, opts: R = {}) => {
    doc.font(opts.bold ? "Helvetica-Bold" : opts.italic ? "Helvetica-BoldOblique" : "Helvetica")
      .fontSize(opts.size ?? 6.2).fillColor(ink)
      .text(s(value), x, y, { width: w, align: opts.align || "left", lineGap: 0, characterSpacing: 0 });
  };
  const cell = (value: unknown, x: number, y: number, w: number, opts: R = {}) =>
    text(value, x + 3, y + 3, w - 6, opts);
  const sellerAddress = address(seller.address || seller.registered_address);
  const buyerAddress = address(buyer.billing_address || buyer.address);
  const consigneeAddress = address(delivery.address || buyer.shipping_address || buyer.billing_address || buyer.address);
  let qr: Buffer | undefined;
  try {
    const dataUrl = await QRCode.toDataURL(s(invoice.generated_irn || invoice.invoice_number), { margin: 0, width: 220, errorCorrectionLevel: "M" });
    qr = Buffer.from(dataUrl.split(",")[1], "base64");
  } catch { /* invoice PDF remains available if QR rendering fails */ }

  // Header and IRN/QR block: the QR has its own reserved space and never overlaps the particulars grid.
  text(invoice.status === "draft" ? "Tax Invoice (Draft)" : "Tax Invoice", L, 28, W, { bold: true, size: 10.5, align: "center" });
  text("e-Invoice", RIGHT - 83, 28, 78, { bold: true, size: 7, align: "center" });
  text("IRN / Invoice Reference:", L + 4, 61, 112, { bold: true, size: 6 });
  text(invoice.generated_irn, L + 116, 61, 340, { size: 5.3 });
  if (qr) doc.image(qr, RIGHT - 77, 43, { fit: [73, 73] });

  // Seller and consignee/buyer share the left 48% column exactly as in the supplied template.
  const gridY = 126, leftW = W * 0.48, colW = W * 0.26, rightX = L + leftW;
  const metaRows: [string, string][] = [
    ["Invoice No.", s(invoice.invoice_number) + "     Dated: " + date(invoice.invoice_date)],
    ["Delivery Note", s(delivery.delivery_note) + "     Mode/Terms: " + s(delivery.payment_terms)],
    ["Reference No. & Date", s(delivery.reference_number) + "     Other References: " + s(delivery.other_references)],
    ["Buyer's Order No.", s(delivery.buyer_order_number) + "     Dated: " + date(delivery.buyer_order_date)],
    ["Dispatch Doc No.", s(transport.dispatch_doc_number) + "     Delivery Note Date: " + date(transport.delivery_note_date)],
    ["Dispatched through", s(transport.dispatched_through) + "     Destination: " + s(transport.destination)],
    ["Bill of Lading/LR-RR No.", s(transport.lr_number) + "     Motor Vehicle No.: " + s(transport.vehicle_number)],
    ["Terms of Delivery", s(transport.terms) + "     Place of Supply: " + s(invoice.place_of_supply_state_code)]
  ];
  const metaH = 15.4;
  box(L, gridY, leftW, metaH * 8);
  box(rightX, gridY, W - leftW, metaH * 8);
  const sellerLines = [
    s(seller.legal_name),
    sellerAddress,
    seller.gstin ? "GSTIN/UIN: " + s(seller.gstin) : "",
    seller.state_name ? "State Name: " + s(seller.state_name) + "  Code: " + s(seller.state_code) : "",
    seller.email ? "E-Mail: " + s(seller.email) : ""
  ].filter(Boolean);
  sellerLines.forEach((v, i) => text(v, L + 5, gridY + 5 + i * 8, leftW - 10, { size: i === 0 ? 7 : 5.9, bold: i === 0 }));

  const partyY = gridY + 47;
  rule(partyY, L, L + leftW);
  text("Consignee (Ship to)", L + 5, partyY + 3, leftW - 10, { size: 6, bold: true });
  const consigneeLines = [s(delivery.name || buyer.legal_name), consigneeAddress, delivery.gstin ? "GSTIN/UIN: " + s(delivery.gstin) : buyer.gstin ? "GSTIN/UIN: " + s(buyer.gstin) : "", buyer.state_name ? "State Name: " + s(buyer.state_name) + "  Code: " + s(buyer.state_code) : ""].filter(Boolean);
  consigneeLines.forEach((v, i) => text(v, L + 5, partyY + 12 + i * 7, leftW - 10, { size: 5.7, bold: i === 0 }));
  const buyerY = partyY + 42;
  rule(buyerY, L, L + leftW);
  text("Buyer (Bill to)", L + 5, buyerY + 3, leftW - 10, { size: 6, bold: true });
  const buyerLines = [s(buyer.legal_name), buyerAddress, buyer.gstin ? "GSTIN/UIN: " + s(buyer.gstin) : "", buyer.state_name ? "State Name: " + s(buyer.state_name) + "  Code: " + s(buyer.state_code) : ""].filter(Boolean);
  buyerLines.forEach((v, i) => text(v, L + 5, buyerY + 12 + i * 7, leftW - 10, { size: 5.7, bold: i === 0 }));

  metaRows.forEach((row, i) => {
    const y = gridY + i * metaH;
    if (i) rule(y, rightX, RIGHT);
    const [label, value] = row;
    text(label, rightX + 4, y + 3, 105, { size: 5.7 });
    text(value, rightX + 111, y + 3, W - leftW - 116, { size: 5.6, bold: i === 0 || Boolean(value.trim()) });
  });

  let y = gridY + metaH * 8;
  // Goods table follows the same 7-column Tally-style layout and fixed proportions as the template.
  const widths = [27, 231, 54, 70, 54, 27, 75.3];
  const headings = ["Sl\nNo.", "Description of Goods", "HSN/SAC", "Quantity", "Rate", "per", "Amount"];
  const tableHead = () => {
    box(L, y, W, 25);
    let x = L;
    headings.forEach((h, i) => { cell(h, x, y + (i === 0 ? 1 : 0), widths[i], { size: 6.2, align: i === 0 || i === 2 || i === 5 ? "center" : "left" }); x += widths[i]; });
    y += 25;
  };
  tableHead();

  const taxTotal = n(invoice.cgst_total) + n(invoice.sgst_total) + n(invoice.igst_total) + n(invoice.cess_total);
  rows.forEach((item, index) => {
    const description = s(item.description);
    doc.font("Helvetica").fontSize(6.3);
    const descHeight = doc.heightOfString(description, { width: widths[1] - 8 });
    const rowH = Math.max(17, descHeight + 7);
    if (y + rowH + 100 > 785) { doc.addPage({ size: "A4", margin: 28.35 }); y = 28.35; tableHead(); }
    box(L, y, W, rowH);
    let x = L;
    const values = [String(index + 1), description, s(item.hsn_code), money(item.quantity), money(item.unit_rate), s(item.unit_code), money(item.taxable_value)];
    values.forEach((v, i) => { cell(v, x, y, widths[i], { size: 6.1, bold: i === 1, align: [0, 2, 5].includes(i) ? "center" : i >= 3 ? "right" : "left" }); x += widths[i]; });
    y += rowH;

    const halfRate = n(item.gst_rate) / 2;
    const taxes: [string, number, string][] = n(item.igst_amount) > 0
      ? [["IGST @" + n(item.gst_rate).toFixed(2) + "% OUTPUT TAX", n(item.igst_amount), n(item.gst_rate).toFixed(2)]]
      : [["CGST @" + halfRate.toFixed(2) + "% OUTPUT TAX", n(item.cgst_amount), halfRate.toFixed(2)], ["SGST @" + halfRate.toFixed(2) + "% OUTPUT TAX", n(item.sgst_amount), halfRate.toFixed(2)]];
    taxes.forEach(([label, amount, rate]) => {
      box(L, y, W, 13);
      text(label, L + 260, y + 3, 165, { italic: true, size: 5.9, align: "right" });
      text(rate, RIGHT - 123, y + 3, 35, { size: 5.9, align: "right" });
      text("%", RIGHT - 84, y + 3, 14, { size: 5.9, align: "center" });
      text(money(amount), RIGHT - 67, y + 3, 62, { size: 6, bold: true, align: "right" });
      y += 13;
    });
  });

  // Template's deliberate open breathing space before the total line.
  const spacer = Math.min(48, Math.max(12, 54 - rows.length * 3));
  y += spacer;
  box(L, y, W, 18);
  text("Total", L + 300, y + 4, 70, { size: 6.2, align: "right" });
  text(rows.reduce((sum, item) => sum + n(item.quantity), 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), RIGHT - 205, y + 4, 75, { size: 6, bold: true, align: "right" });
  text("₹ " + money(invoice.grand_total), RIGHT - 82, y + 4, 77, { size: 7, bold: true, align: "right" });
  y += 18;

  box(L, y, W, 29);
  text("Amount Chargeable (in words)", L + 4, y + 4, 180, { size: 5.9 });
  text("E. & O.E", RIGHT - 60, y + 4, 55, { size: 5.6, italic: true, align: "right" });
  text(inrWords(n(invoice.grand_total)), L + 4, y + 15, W - 8, { size: 6.5, bold: true });
  y += 29;

  // HSN tax summary table, with grouped totals from actual invoice lines.
  const groups = new Map<string, R>();
  rows.forEach(item => {
    const key = s(item.hsn_code) + "|" + n(item.gst_rate);
    const group = groups.get(key) || { hsn: s(item.hsn_code), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    group.taxable += n(item.taxable_value); group.cgst += n(item.cgst_amount); group.sgst += n(item.sgst_amount); group.igst += n(item.igst_amount);
    groups.set(key, group);
  });
  const hs = [110, 90, 43, 75, 43, 75, 102.3];
  const hHead = ["HSN/SAC", "Taxable Value", "CGST Rate", "CGST Amount", "SGST Rate", "SGST Amount", "Total Tax"];
  box(L, y, W, 17);
  let hx = L;
  hHead.forEach((v, i) => { cell(v, hx, y, hs[i], { size: 5.3, align: i === 0 ? "left" : "center" }); hx += hs[i]; });
  y += 17;
  for (const g of groups.values()) {
    box(L, y, W, 14);
    let x = L;
    const values = [g.hsn, money(g.taxable), g.igst ? "0.00%" : "2.50%", money(g.igst ? 0 : g.cgst), g.igst ? "0.00%" : "2.50%", money(g.igst ? 0 : g.sgst), money(g.cgst + g.sgst + g.igst)];
    values.forEach((v, i) => { cell(v, x, y, hs[i], { size: 5.4, align: i === 0 ? "left" : "right" }); x += hs[i]; });
    y += 14;
  }
  box(L, y, W, 14);
  text("Total", L + 4, y + 3, hs[0] - 8, { size: 5.5, bold: true, align: "right" });
  text(money(rows.reduce((sum, item) => sum + n(item.taxable_value), 0)), L + hs[0] + 3, y + 3, hs[1] - 6, { size: 5.5, bold: true, align: "right" });
  text(money(invoice.cgst_total), L + hs[0] + hs[1] + hs[2] + 3, y + 3, hs[3] - 6, { size: 5.5, bold: true, align: "right" });
  text(money(invoice.sgst_total), L + hs[0] + hs[1] + hs[2] + hs[3] + hs[4] + 3, y + 3, hs[5] - 6, { size: 5.5, bold: true, align: "right" });
  text(money(taxTotal), RIGHT - hs[6] + 3, y + 3, hs[6] - 6, { size: 5.5, bold: true, align: "right" });
  y += 14;

  text("Tax Amount (in words):", L + 4, y + 4, 112, { size: 5.7 });
  text(inrWords(taxTotal), L + 116, y + 4, W - 120, { size: 5.7, bold: true });
  y += 20;

  // Footer is held together as in the HTML template; move intact to a second page only if necessary.
  if (y + 110 > 790) { doc.addPage({ size: "A4", margin: 28.35 }); y = 35; }
  const footerH = 65;
  box(L, y, 300, footerH);
  box(L + 300, y, W - 300, footerH);
  text("Declaration", L + 5, y + 5, 285, { size: 6, bold: true });
  text("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", L + 5, y + 16, 285, { size: 5.8 });
  text("Company's Bank Details", L + 305, y + 5, W - 310, { size: 6, bold: true });
  const bankLines = [
    bank?.account_holder_name ? "A/c Holder's Name: " + s(bank.account_holder_name) : "",
    bank?.bank_name ? "Bank Name: " + s(bank.bank_name) : "",
    bank?.account_number ? "A/c No.: " + s(bank.account_number) : "",
    bank ? "Branch & IFSC Code: " + [s(bank.branch_name), s(bank.ifsc_code)].filter(Boolean).join(" / ") : ""
  ].filter(Boolean);
  bankLines.forEach((v, i) => text(v, L + 305, y + 16 + i * 9, W - 310, { size: 5.5 }));
  y += footerH + 4;
  text("For " + s(seller.legal_name), RIGHT - 180, y, 175, { size: 6.1, bold: true, align: "right" });
  text("Authorised Signatory", RIGHT - 180, y + 21, 175, { size: 5.8, align: "right" });
  rule(y + 43);
  text("This is a Computer Generated Invoice", L, y + 48, W, { size: 5.8, align: "center" });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (range.count > 1) text("Page " + (i + 1) + " of " + range.count, L, 815, W, { size: 5, align: "right" });
  }
  doc.end();
  const pdf = await finished;
  const filename = s(invoice.invoice_number).replace(/[^a-zA-Z0-9._-]/g, "_") + ".pdf";
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="' + filename + '"', "Cache-Control": "private, no-store" }
  });
}
