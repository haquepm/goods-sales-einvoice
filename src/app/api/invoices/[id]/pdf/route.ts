import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;
const s = (v: unknown) => String(v ?? "").trim();
const n = (v: unknown) => Number(v || 0);
const money = (v: unknown) =>
  n(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const date = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v).length === 10 ? String(v) + "T00:00:00" : String(v));
  return Number.isNaN(d.getTime())
    ? s(v)
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "-");
};

const address = (v: unknown) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v !== "object") return s(v);
  const x = v as R;
  return [
    x.line1 || x.address_line_1,
    x.line2 || x.address_line_2,
    x.city,
    x.district,
    x.state || x.state_name,
    x.postal_code || x.pincode,
  ]
    .filter(Boolean)
    .map(s)
    .join(", ");
};

const smallWords = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const tensWords = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underThousand(n0: number): string {
  const v = Math.floor(n0);
  if (v === 0) return "";
  if (v < 20) return smallWords[v];
  if (v < 100) return tensWords[Math.floor(v / 10)] + (v % 10 ? " " + smallWords[v % 10] : "");
  const rem = v % 100;
  return smallWords[Math.floor(v / 100)] + " Hundred" + (rem ? " " + underThousand(rem) : "");
}

function amountWords(value: number): string {
  let v = Math.floor(Math.abs(value));
  if (!v) return "Zero";
  const parts: string[] = [];
  for (const [unit, label] of [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
    [1, ""],
  ] as [number, string][]) {
    if (v >= unit) {
      const q = Math.floor(v / unit);
      parts.push(underThousand(q) + (label ? " " + label : ""));
      v %= unit;
    }
  }
  return parts.join(" ");
}

const inrWords = (v: number) => {
  const rupees = Math.floor(Math.abs(v));
  const paise = Math.round((Math.abs(v) - rupees) * 100);
  return (
    "Indian Rupee " +
    amountWords(rupees) +
    (paise ? " and " + amountWords(paise) + " paise" : "") +
    " Only"
  );
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  if (!businesses?.[0]) return NextResponse.json({ error: "Business workspace not found" }, { status: 404 });

  const businessId = businesses[0].id;
  const { data: invoice } = await supabase
    .from("goods_invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const [{ data: items }, { data: bank }] = await Promise.all([
    supabase.from("goods_invoice_items").select("*").eq("invoice_id", id).order("line_number"),
    supabase
      .from("business_bank_accounts")
      .select("account_holder_name,bank_name,account_number,ifsc_code,branch_name")
      .eq("business_id", businessId)
      .eq("is_default", true)
      .maybeSingle(),
  ]);

  const seller = (invoice.seller_snapshot || {}) as R;
  const buyer = (invoice.buyer_snapshot || {}) as R;
  const delivery = (invoice.delivery_details || {}) as R;
  const transport = (invoice.transport_details || {}) as R;
  const rows = (items || []) as R[];

  // A4 Portrait: 595.28 x 841.89 pt | 10mm (28.35pt) margins | 538.58pt content width
  const doc = new PDFDocument({
    size: "A4",
    margin: 28.35,
    bufferPages: true,
    info: { Title: "Tax Invoice " + invoice.invoice_number },
  });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const L = 28.35;
  const W = 538.58;
  const RIGHT = L + W;
  const ink = "#000000";

  const hline = (y: number, x1 = L, x2 = RIGHT, lw = 0.5) =>
    doc.moveTo(x1, y).lineTo(x2, y).lineWidth(lw).strokeColor(ink).stroke();
  const vline = (x: number, y1: number, y2: number, lw = 0.5) =>
    doc.moveTo(x, y1).lineTo(x, y2).lineWidth(lw).strokeColor(ink).stroke();
  const box = (x: number, y: number, w: number, h: number, lw = 0.5) =>
    doc.rect(x, y, w, h).lineWidth(lw).strokeColor(ink).stroke();

  const text = (value: unknown, x: number, y: number, w: number, opts: R = {}) => {
    doc
      .font(opts.bold ? "Helvetica-Bold" : opts.italic ? "Helvetica-BoldOblique" : "Helvetica")
      .fontSize(opts.size ?? 8)
      .fillColor(ink)
      .text(s(value), x, y, {
        width: w,
        align: opts.align || "left",
        lineGap: opts.lineGap ?? 1,
        underline: Boolean(opts.underline),
      });
  };

  const sellerAddress = address(seller.address || seller.registered_address);
  const buyerAddress = address(buyer.billing_address || buyer.address);
  const consigneeAddress = address(
    delivery.address || buyer.shipping_address || buyer.billing_address || buyer.address
  );

  let qr: Buffer | undefined;
  try {
    const qrPayload = s(invoice.signed_qr_code || invoice.generated_irn || invoice.invoice_number);
    const dataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 0,
      width: 240,
      errorCorrectionLevel: "M",
    });
    qr = Buffer.from(dataUrl.split(",")[1], "base64");
  } catch {
    /* ignore QR failure */
  }

  // ==================== 1. HEADER & IRN / QR SECTION ====================
  text(invoice.status === "draft" ? "Tax Invoice (Draft)" : "Tax Invoice", L, 24, W, {
    bold: true,
    size: 11.5,
    align: "center",
  });

  if (invoice.generated_irn || qr) {
    text("e-Invoice", RIGHT - 82, 24, 82, { bold: true, size: 8, align: "center" });
  }

  // Left IRN / Ack Details (aligned near bottom of QR)
  const irnY = 66;
  if (invoice.generated_irn) {
    text("IRN", L + 2, irnY, 45, { size: 7.5 });
    text(": " + s(invoice.generated_irn), L + 48, irnY, 395, { bold: true, size: 7.2 });
  }
  if (invoice.ack_no) {
    text("Ack No.", L + 2, irnY + 19, 45, { size: 7.5 });
    text(": " + s(invoice.ack_no), L + 48, irnY + 19, 250, { bold: true, size: 7.5 });
  }
  if (invoice.ack_date) {
    text("Ack Date", L + 2, irnY + 30, 45, { size: 7.5 });
    text(": " + date(invoice.ack_date), L + 48, irnY + 30, 250, { bold: true, size: 7.5 });
  }

  if (qr) {
    doc.image(qr, RIGHT - 80, 36, { fit: [78, 78] });
  }

  // ==================== 2. TOP PARTY & METADATA GRID ====================
  const gridY = 118;
  const leftW = Math.round(W * 0.48); // ~258.5pt
  const rightW = W - leftW; // ~280pt
  const midRightX = L + leftW + rightW / 2;
  const rightX = L + leftW;

  const metaPairs: [[string, string], [string, string]][] = [
    [
      ["Invoice No.", s(invoice.invoice_number)],
      ["Dated", date(invoice.invoice_date)],
    ],
    [
      ["Delivery Note", s(delivery.delivery_note)],
      ["Mode/Terms of Payment", s(delivery.payment_terms)],
    ],
    [
      ["Reference No. & Date.", s(delivery.reference_number)],
      ["Other References", s(delivery.other_references)],
    ],
    [
      ["Buyer's Order No.", s(delivery.buyer_order_number)],
      ["Dated", date(delivery.buyer_order_date)],
    ],
    [
      ["Dispatch Doc No.", s(transport.dispatch_doc_number)],
      ["Delivery Note Date", date(transport.delivery_note_date)],
    ],
    [
      ["Dispatched through", s(transport.dispatched_through)],
      ["Destination", s(transport.destination)],
    ],
    [
      ["Bill of Lading/LR-RR No.", s(transport.lr_number)],
      ["Motor Vehicle No.", s(transport.vehicle_number)],
    ],
  ];

  const metaRowH = 22;
  const termsRowH = 34;
  const topGridH = metaPairs.length * metaRowH + termsRowH; // 188pt

  box(L, gridY, W, topGridH);
  vline(rightX, gridY, gridY + topGridH);
  vline(midRightX, gridY, gridY + metaPairs.length * metaRowH);

  // Left Column: Seller (62pt) -> Consignee (63pt) -> Buyer (63pt)
  const sellerH = 62;
  const consigneeY = gridY + sellerH;
  const buyerY = consigneeY + 63;

  hline(consigneeY, L, rightX);
  hline(buyerY, L, rightX);

  // Seller Block
  text(s(seller.legal_name), L + 4, gridY + 4, leftW - 8, { bold: true, size: 8.2 });
  const sellerMeta = [
    sellerAddress,
    seller.msme_number ? "MSME: " + s(seller.msme_number) : "",
    seller.gstin ? "GSTIN/UIN: " + s(seller.gstin) : "",
    seller.state_name ? `State Name : ${s(seller.state_name)}, Code : ${s(seller.state_code)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  text(sellerMeta, L + 4, gridY + 14, leftW - 8, { size: 7.2, lineGap: 0.8 });

  // Consignee Block
  text("Consignee (Ship to)", L + 4, consigneeY + 3, leftW - 8, { size: 7 });
  text(s(delivery.name || buyer.legal_name), L + 4, consigneeY + 12, leftW - 8, { bold: true, size: 8 });
  const consigneeMeta = [
    consigneeAddress,
    delivery.gstin || buyer.gstin ? "GSTIN/UIN   : " + s(delivery.gstin || buyer.gstin) : "",
    buyer.state_name ? `State Name  : ${s(buyer.state_name)}, Code : ${s(buyer.state_code)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  text(consigneeMeta, L + 4, consigneeY + 22, leftW - 8, { size: 7.1, lineGap: 0.8 });

  // Buyer Block
  text("Buyer (Bill to)", L + 4, buyerY + 3, leftW - 8, { size: 7 });
  text(s(buyer.legal_name), L + 4, buyerY + 12, leftW - 8, { bold: true, size: 8 });
  const buyerMeta = [
    buyerAddress,
    buyer.gstin ? "GSTIN/UIN   : " + s(buyer.gstin) : "",
    buyer.state_name ? `State Name  : ${s(buyer.state_name)}, Code : ${s(buyer.state_code)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  text(buyerMeta, L + 4, buyerY + 22, leftW - 8, { size: 7.1, lineGap: 0.8 });

  // Right Column: 7 pairs + Terms of Delivery
  metaPairs.forEach((pair, idx) => {
    const ry = gridY + idx * metaRowH;
    if (idx > 0) hline(ry, rightX, RIGHT);
    const [[l1, v1], [l2, v2]] = pair;
    text(l1, rightX + 4, ry + 2.5, rightW / 2 - 8, { size: 6.8 });
    text(v1, rightX + 4, ry + 11.5, rightW / 2 - 8, { bold: true, size: 7.8 });
    text(l2, midRightX + 4, ry + 2.5, rightW / 2 - 8, { size: 6.8 });
    text(v2, midRightX + 4, ry + 11.5, rightW / 2 - 8, { bold: true, size: 7.8 });
  });

  const termsY = gridY + metaPairs.length * metaRowH;
  hline(termsY, rightX, RIGHT);
  text("Terms of Delivery", rightX + 4, termsY + 2.5, rightW - 8, { size: 6.8 });
  if (transport.terms) {
    text(s(transport.terms), rightX + 4, termsY + 12, rightW - 8, { bold: true, size: 7.6 });
  }

  // ==================== 3. LINE ITEMS TABLE ====================
  let y = gridY + topGridH;
  // Exact column widths summing to 538.58pt
  const colWidths = [24, 232.58, 52, 72, 54, 26, 78];
  const colX: number[] = [];
  colWidths.reduce((acc, w) => {
    colX.push(acc);
    return acc + w;
  }, L);

  const drawItemsHeader = () => {
    const hh = 22;
    box(L, y, W, hh);
    colX.slice(1).forEach((x) => vline(x, y, y + hh));
    const heads = ["Sl\nNo.", "Description of Goods", "HSN/SAC", "Quantity", "Rate", "per", "Amount"];
    heads.forEach((h, i) => {
      text(h, colX[i] + 2, y + (i === 0 ? 2 : 6), colWidths[i] - 4, {
        size: 7.5,
        align: "center",
      });
    });
    y += hh;
  };

  const itemsStartY = y;
  drawItemsHeader();

  rows.forEach((item, index) => {
    const desc = s(item.description);
    doc.font("Helvetica-Bold").fontSize(8);
    const descH = doc.heightOfString(desc, { width: colWidths[1] - 8 });
    const rowH = Math.max(18, descH + 8);

    if (y + rowH + 140 > 790) {
      // Close vertical lines on current page before breaking
      colX.slice(1).forEach((x) => vline(x, itemsStartY, y));
      doc.addPage({ size: "A4", margin: 28.35 });
      y = 28.35;
      drawItemsHeader();
    }

    const qtyWithUnit = `${n(item.quantity).toFixed(3)} ${s(item.unit_code)}`.trim();

    text(String(index + 1), colX[0] + 2, y + 4, colWidths[0] - 4, { size: 7.8, align: "center" });
    text(desc, colX[1] + 4, y + 4, colWidths[1] - 8, { bold: true, size: 8 });
    text(s(item.hsn_code), colX[2] + 2, y + 4, colWidths[2] - 4, { size: 7.8, align: "center" });
    text(qtyWithUnit, colX[3] + 2, y + 4, colWidths[3] - 6, { bold: true, size: 7.8, align: "right" });
    text(money(item.unit_rate), colX[4] + 2, y + 4, colWidths[4] - 6, { size: 7.8, align: "right" });
    text(s(item.unit_code), colX[5] + 2, y + 4, colWidths[5] - 4, { size: 7.5, align: "center" });
    text(money(item.taxable_value), colX[6] + 2, y + 4, colWidths[6] - 6, { bold: true, size: 8, align: "right" });

    y += rowH;
  });

  // Tax rows inside Description column (Tally style)
  y += 10;
  const hasIgst = n(invoice.igst_total) > 0;
  const sampleRate = rows[0] ? n(rows[0].gst_rate) : 5;
  const taxLines: [string, string, number][] = hasIgst
    ? [[`IGST @${sampleRate}% OUTPUT TAX`, sampleRate.toFixed(2), n(invoice.igst_total)]]
    : [
        [`CGST @${sampleRate / 2}% OUTPUT TAX`, (sampleRate / 2).toFixed(2), n(invoice.cgst_total)],
        [`SGST @${sampleRate / 2}% OUTPUT TAX`, (sampleRate / 2).toFixed(2), n(invoice.sgst_total)],
      ];

  taxLines.forEach(([label, rateStr, amt]) => {
    text(label, colX[1] + 4, y + 2, colWidths[1] - 8, { italic: true, size: 8, align: "right" });
    text(rateStr, colX[4] + 2, y + 2, colWidths[4] - 6, { size: 7.8, align: "right" });
    text("%", colX[5] + 2, y + 2, colWidths[5] - 4, { size: 7.5, align: "center" });
    text(money(amt), colX[6] + 2, y + 2, colWidths[6] - 6, { bold: true, size: 8, align: "right" });
    y += 14;
  });

  // Maintain Tally's open vertical spacing before Total row
  const minItemsBottom = 465;
  if (y < minItemsBottom) y = minItemsBottom;

  // Draw outer box and continuous vertical column dividers for entire items section
  box(L, itemsStartY, W, y - itemsStartY);
  colX.slice(1).forEach((x) => vline(x, itemsStartY, y));

  // Total Row
  const totalH = 18;
  box(L, y, W, totalH);
  colX.slice(1).forEach((x) => vline(x, y, y + totalH));

  const totalQty = rows.reduce((sum, item) => sum + n(item.quantity), 0);
  const firstUnit = rows[0] ? s(rows[0].unit_code) : "";
  text("Total", colX[1] + 4, y + 4.5, colWidths[1] - 8, { size: 8, align: "right" });
  text(`${totalQty.toFixed(3)} ${firstUnit}`.trim(), colX[3] + 2, y + 4.5, colWidths[3] - 6, {
    bold: true,
    size: 7.8,
    align: "right",
  });
  text("Rs. " + money(invoice.grand_total), colX[6] + 2, y + 4, colWidths[6] - 6, {
    bold: true,
    size: 8.5,
    align: "right",
  });
  y += totalH;

  // ==================== 4. AMOUNT IN WORDS ====================
  const wordsH = 28;
  box(L, y, W, wordsH);
  text("Amount Chargeable (in words)", L + 4, y + 3, 200, { size: 7 });
  text("E. & O.E", RIGHT - 60, y + 3, 56, { size: 7, italic: true, align: "right" });
  text(inrWords(n(invoice.grand_total)), L + 4, y + 13.5, W - 8, { bold: true, size: 8.2 });
  y += wordsH;

  // ==================== 5. HSN/SAC TAX BREAKUP MATRIX ====================
  const groups = new Map<string, R>();
  rows.forEach((item) => {
    const key = s(item.hsn_code) + "|" + n(item.gst_rate);
    const g = groups.get(key) || {
      hsn: s(item.hsn_code),
      rate: n(item.gst_rate),
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
    g.taxable += n(item.taxable_value);
    g.cgst += n(item.cgst_amount);
    g.sgst += n(item.sgst_amount);
    g.igst += n(item.igst_amount);
    groups.set(key, g);
  });

  // 7 columns summing to 538.58pt
  const hsnWidths = [188.58, 72, 42, 66, 42, 66, 62];
  const hsnX: number[] = [];
  hsnWidths.reduce((acc, w) => {
    hsnX.push(acc);
    return acc + w;
  }, L);

  const hsnHeadH = 24;
  box(L, y, W, hsnHeadH);
  // Vertical dividers for HSN header
  vline(hsnX[1], y, y + hsnHeadH);
  vline(hsnX[2], y, y + hsnHeadH);
  vline(hsnX[3], y + 12, y + hsnHeadH);
  vline(hsnX[4], y, y + hsnHeadH);
  vline(hsnX[5], y + 12, y + hsnHeadH);
  vline(hsnX[6], y, y + hsnHeadH);
  // Horizontal split under CGST and SGST/UTGST
  hline(y + 12, hsnX[2], hsnX[6]);

  text("HSN/SAC", hsnX[0], y + 7, hsnWidths[0], { size: 7.5, align: "center" });
  text("Taxable\nValue", hsnX[1], y + 3, hsnWidths[1], { size: 7.2, align: "center" });
  text("CGST", hsnX[2], y + 2, hsnWidths[2] + hsnWidths[3], { size: 7.2, align: "center" });
  text("Rate", hsnX[2], y + 14, hsnWidths[2], { size: 7, align: "center" });
  text("Amount", hsnX[3], y + 14, hsnWidths[3], { size: 7, align: "center" });
  text("SGST/UTGST", hsnX[4], y + 2, hsnWidths[4] + hsnWidths[5], { size: 7.2, align: "center" });
  text("Rate", hsnX[4], y + 14, hsnWidths[4], { size: 7, align: "center" });
  text("Amount", hsnX[5], y + 14, hsnWidths[5], { size: 7, align: "center" });
  text("Total\nTax Amount", hsnX[6], y + 3, hsnWidths[6], { size: 7.2, align: "center" });
  y += hsnHeadH;

  const taxTotal = n(invoice.cgst_total) + n(invoice.sgst_total) + n(invoice.igst_total);

  for (const g of groups.values()) {
    const rh = 15;
    box(L, y, W, rh);
    hsnX.slice(1).forEach((x) => vline(x, y, y + rh));
    const half = (g.rate / 2).toFixed(2) + "%";
    text(g.hsn, hsnX[0] + 4, y + 3.5, hsnWidths[0] - 8, { size: 7.5 });
    text(money(g.taxable), hsnX[1] + 2, y + 3.5, hsnWidths[1] - 6, { size: 7.5, align: "right" });
    text(g.igst ? "0.00%" : half, hsnX[2] + 2, y + 3.5, hsnWidths[2] - 4, { size: 7.5, align: "right" });
    text(money(g.igst ? 0 : g.cgst), hsnX[3] + 2, y + 3.5, hsnWidths[3] - 6, { size: 7.5, align: "right" });
    text(g.igst ? "0.00%" : half, hsnX[4] + 2, y + 3.5, hsnWidths[4] - 4, { size: 7.5, align: "right" });
    text(money(g.igst ? 0 : g.sgst), hsnX[5] + 2, y + 3.5, hsnWidths[5] - 6, { size: 7.5, align: "right" });
    text(money(g.cgst + g.sgst + g.igst), hsnX[6] + 2, y + 3.5, hsnWidths[6] - 6, { size: 7.5, align: "right" });
    y += rh;
  }

  // HSN Total Row
  const hsnTotH = 15;
  box(L, y, W, hsnTotH);
  hsnX.slice(1).forEach((x) => vline(x, y, y + hsnTotH));
  text("Total", hsnX[0] + 4, y + 3.5, hsnWidths[0] - 8, { bold: true, size: 7.5, align: "right" });
  text(money(rows.reduce((sum, item) => sum + n(item.taxable_value), 0)), hsnX[1] + 2, y + 3.5, hsnWidths[1] - 6, {
    bold: true,
    size: 7.5,
    align: "right",
  });
  text(money(invoice.cgst_total), hsnX[3] + 2, y + 3.5, hsnWidths[3] - 6, { bold: true, size: 7.5, align: "right" });
  text(money(invoice.sgst_total), hsnX[5] + 2, y + 3.5, hsnWidths[5] - 6, { bold: true, size: 7.5, align: "right" });
  text(money(taxTotal), hsnX[6] + 2, y + 3.5, hsnWidths[6] - 6, { bold: true, size: 7.5, align: "right" });
  y += hsnTotH;

  // ==================== 6. FOOTER: TAX WORDS, BANK, DECLARATION & SIGNATORY ====================
  if (y + 115 > 805) {
    doc.addPage({ size: "A4", margin: 28.35 });
    y = 28.35;
  }

  const footerBoxH = 98;
  box(L, y, W, footerBoxH);

  // Tax Amount in Words at top of footer box
  text("Tax Amount (in words) : ", L + 4, y + 4, 95, { size: 7.3 });
  text(inrWords(taxTotal), L + 98, y + 4, W - 102, { bold: true, size: 7.8 });

  // Bank Details (Right half)
  const bankX = L + 255;
  text("Company's Bank Details", bankX, y + 18, W - 260, { size: 7.3 });
  const bankPairs: [string, string][] = [
    ["A/c Holder's Name", s(bank?.account_holder_name || seller.legal_name)],
    ["Bank Name", s(bank?.bank_name)],
    ["A/c No.", s(bank?.account_number)],
    ["Branch & IFS Code", [s(bank?.branch_name), s(bank?.ifsc_code)].filter(Boolean).join(" & ")],
  ].filter(([, val]) => Boolean(val));

  bankPairs.forEach(([k, v], i) => {
    const by = y + 28 + i * 9.5;
    text(k, bankX, by, 85, { size: 7.2 });
    text(": " + v, bankX + 86, by, RIGHT - (bankX + 90), { bold: true, size: 7.4 });
  });

  // Declaration (Bottom Left)
  text("Declaration", L + 4, y + 60, 240, { size: 7.2, underline: true });
  text(
    "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
    L + 4,
    y + 70,
    245,
    { size: 7.2, lineGap: 0.8 }
  );

  // Authorised Signatory Box (Bottom Right, inside main border)
  const sigW = 240;
  const sigH = 44;
  const sigX = RIGHT - sigW;
  const sigY = y + footerBoxH - sigH;
  hline(sigY, sigX, RIGHT);
  vline(sigX, sigY, y + footerBoxH);
  text("for " + s(seller.legal_name), sigX + 4, sigY + 4, sigW - 10, { bold: true, size: 7.6, align: "right" });
  text("Authorised Signatory", sigX + 4, sigY + sigH - 12, sigW - 10, { size: 7.3, align: "right" });

  // Bottom Centered Note outside border
  text("This is a Computer Generated Invoice", L, y + footerBoxH + 5, W, { size: 7.3, align: "center" });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (range.count > 1) {
      text(`Page ${i + 1} of ${range.count}`, L, 818, W, { size: 7, align: "right" });
    }
  }

  doc.end();
  const pdf = await finished;
  const filename = s(invoice.invoice_number).replace(/[^a-zA-Z0-9._-]/g, "_") + ".pdf";
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
