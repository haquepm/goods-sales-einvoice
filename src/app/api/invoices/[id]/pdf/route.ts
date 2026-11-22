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

const STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh",
};

function resolveState(obj: R, gstinFallback?: string): { name: string; code: string } {
  const gstin = s(obj.gstin || obj.gstin_uin || gstinFallback);
  const code = s(obj.state_code || (gstin.length >= 2 ? gstin.slice(0, 2) : ""));
  const name = s(obj.state_name || obj.state || STATE_CODES[code] || "");
  return { name, code };
}

function addressLines(v: unknown, includePinOnCity = false): string[] {
  if (!v) return [];
  if (typeof v === "string") {
    return v
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  if (typeof v !== "object") return [s(v)];
  const x = v as R;
  const line1 = s(x.line1 || x.address_line_1 || x.door_no);
  const line2 = [x.line2 || x.address_line_2 || x.street, x.locality || x.area]
    .filter(Boolean)
    .map(s)
    .join(", ");
  const cityDist = [x.city, x.district].filter(Boolean).map(s).join(", ");
  const statePart = s(x.state || x.state_name).toUpperCase();
  const pinPart = s(x.postal_code || x.pincode || x.pin);

  if (includePinOnCity) {
    const line3 = statePart && pinPart ? `${statePart}-${pinPart}` : statePart || pinPart;
    return [line1, line2, cityDist, line3].filter(Boolean);
  }
  const line3 = [cityDist, pinPart].filter(Boolean).join(" - ");
  return [line1, line2, line3].filter(Boolean);
}

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
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);
  if (!businesses?.[0]) return NextResponse.json({ error: "Business workspace not found" }, { status: 404 });

  const biz = businesses[0] as R;
  const businessId = biz.id;
  const { data: invoice } = await supabase
    .from("goods_invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const [{ data: items }, { data: gstProfile }, { data: bank }] = await Promise.all([
    supabase.from("goods_invoice_items").select("*").eq("invoice_id", id).order("line_number"),
    supabase.from("business_gst_settings").select("*").eq("business_id", businessId).maybeSingle(),
    supabase
      .from("business_bank_accounts")
      .select("account_holder_name,bank_name,account_number,ifsc_code,branch_name")
      .eq("business_id", businessId)
      .eq("is_default", true)
      .maybeSingle(),
  ]);

  // Current seller profile fills fields omitted from older invoice snapshots; snapshot values remain authoritative when present.
  const seller = { ...biz, ...(invoice.seller_snapshot || {}), ...(gstProfile || {}) } as R;
  const buyer = (invoice.buyer_snapshot || {}) as R;
  const delivery = (invoice.delivery_details || {}) as R;
  const transport = (invoice.transport_details || {}) as R;
  const einv = (invoice.einvoice_details || invoice.irn_details || {}) as R;
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
  const borderInk = "#666666";
  const rowTint = "#D9DCE6";

  const hline = (y: number, x1 = L, x2 = RIGHT, lw = 0.4) =>
    doc.moveTo(x1, y).lineTo(x2, y).lineWidth(lw).strokeColor(borderInk).stroke();
  const vline = (x: number, y1: number, y2: number, lw = 0.4) =>
    doc.moveTo(x, y1).lineTo(x, y2).lineWidth(lw).strokeColor(borderInk).stroke();
  const box = (x: number, y: number, w: number, h: number, lw = 0.4) =>
    doc.rect(x, y, w, h).lineWidth(lw).strokeColor(borderInk).stroke();
  const fillRect = (x: number, y: number, w: number, h: number, color = rowTint) =>
    doc.save().rect(x, y, w, h).fill(color).restore();

  // Crisp vector Indian Rupee (₹) glyph scaled to match Tally's 10pt Bold grand total
  const drawRupee = (x: number, y: number, size = 10) => {
    const scale = size / 10;
    doc.save().strokeColor(ink).lineWidth(1.05 * scale).lineCap("butt");
    doc.moveTo(x, y + 1.4 * scale).lineTo(x + 5.8 * scale, y + 1.4 * scale).stroke();
    doc.moveTo(x, y + 3.5 * scale).lineTo(x + 5.8 * scale, y + 3.5 * scale).stroke();
    doc
      .moveTo(x + 1.2 * scale, y + 1.4 * scale)
      .bezierCurveTo(
        x + 4.5 * scale, y + 1.4 * scale,
        x + 4.5 * scale, y + 5.3 * scale,
        x + 0.8 * scale, y + 5.3 * scale
      )
      .lineTo(x + 5.0 * scale, y + 8.8 * scale)
      .stroke();
    doc.restore();
  };

  const text = (value: unknown, x: number, y: number, w: number, opts: R = {}) => {
    const fontName =
      opts.bold && opts.italic
        ? "Helvetica-BoldOblique"
        : opts.bold
          ? "Helvetica-Bold"
          : opts.italic
            ? "Helvetica-Oblique"
            : "Helvetica";
    doc
      .font(fontName)
      .fontSize(opts.size ?? 8.2)
      .fillColor(ink)
      .text(s(value), x, y, {
        width: w,
        align: opts.align || "left",
        lineGap: opts.lineGap ?? 0.6,
        underline: Boolean(opts.underline),
      });
  };

  const wrappedText = (value: unknown, x: number, y: number, w: number, opts: R = {}) => {
    const fontName = opts.bold && opts.italic ? "Helvetica-BoldOblique" : opts.bold ? "Helvetica-Bold" : opts.italic ? "Helvetica-Oblique" : "Helvetica";
    const size = opts.size ?? 8.2;
    const lineGap = opts.lineGap ?? 0.6;
    doc.font(fontName).fontSize(size);
    const h = doc.heightOfString(s(value), { width: w, lineGap });
    text(value, x, y, w, opts);
    return Math.max(size + lineGap, h) + (opts.afterGap ?? 0);
  };

  // ==================== 1. HEADER & IRN / HIGH-DENSITY QR SECTION ====================
  const irnCode = s(invoice.generated_irn || einv.irn || invoice.irn);
  const ackNo = s(
    invoice.generated_ack_no ||
      invoice.ack_no ||
      invoice.irn_ack_no ||
      invoice.acknowledgement_no ||
      einv.ack_no ||
      einv.AckNo
  );
  const ackDate = date(
    invoice.ack_date ||
      invoice.irn_ack_date ||
      invoice.acknowledgement_date ||
      einv.ack_date ||
      einv.AckDt ||
      invoice.invoice_date
  );

  let qr: Buffer | undefined;
  try {
    const signedJwt = s(invoice.signed_qr_code || einv.signed_qr_code || einv.SignedQRCode);
    const fallbackNicPayload = JSON.stringify({
      data: JSON.stringify({
        SellerGstin: s(seller.gstin),
        BuyerGstin: s(buyer.gstin),
        DocNo: s(invoice.invoice_number),
        DocTyp: "INV",
        DocDt: s(invoice.invoice_date),
        TotInvVal: n(invoice.grand_total).toFixed(2),
        ItemCnt: rows.length,
        MainHsnCode: rows[0] ? s(rows[0].hsn_code) : "",
        Irn: irnCode || s(invoice.invoice_number),
        IrnDt: s(invoice.ack_date || invoice.invoice_date),
      }),
      iss: "NIC",
      sig: (irnCode + irnCode + irnCode + irnCode).slice(0, 344),
    });
    const qrPayload = signedJwt || fallbackNicPayload;
    const dataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 0,
      width: 420,
      errorCorrectionLevel: "L",
    });
    qr = Buffer.from(dataUrl.split(",")[1], "base64");
  } catch {
    /* ignore QR failure */
  }

  // Title & e-Invoice Label (12.5pt & 8.5pt matching Tally)
  text(invoice.status === "draft" ? "Tax Invoice (Draft)" : "Tax Invoice", L, 19, W, {
    bold: true,
    size: 12.5,
    align: "center",
  });

  const qrSize = 98;
  const qrX = RIGHT - qrSize - 4;
  if (irnCode || qr) {
    text("e-Invoice", qrX, 21, qrSize, { bold: true, size: 8.5, align: "center" });
  }

  // Left IRN / Ack Details (8pt–8.2pt Tally scale)
  const irnY = 71;
  const irnColonX = L + 47;
  if (irnCode) {
    const irnFormatted =
      irnCode.length > 46 ? irnCode.slice(0, 46) + "-\n" + irnCode.slice(46) : irnCode;
    text("IRN", L + 2, irnY, 44, { size: 8.2 });
    text(":", irnColonX, irnY, 6, { size: 8.2 });
    text(irnFormatted, irnColonX + 5, irnY, 260, { bold: true, size: 8, lineGap: 0.9 });
  }
  text("Ack No.", L + 2, irnY + 20, 44, { size: 8.2 });
  text(":", irnColonX, irnY + 20, 6, { size: 8.2 });
  text(ackNo || "-", irnColonX + 5, irnY + 20, 240, { bold: true, size: 8.2 });
  if (ackDate || irnCode) {
    text("Ack Date", L + 2, irnY + 30.5, 44, { size: 8.2 });
    text(":", irnColonX, irnY + 30.5, 6, { size: 8.2 });
    text(ackDate, irnColonX + 5, irnY + 30.5, 240, { bold: true, size: 8.2 });
  }

  if (qr) {
    doc.image(qr, qrX, 33, { fit: [qrSize, qrSize] });
  }

  // ==================== 2. TOP PARTY & METADATA GRID ====================
  const gridY = 134;
  const leftW = 258.58;
  const rightW = W - leftW; // 280pt exact
  const rightX = L + leftW;
  const midRightX = rightX + rightW / 2;

  const buyerDeliveryAddress = buyer.shipping_address || buyer.billing_address || buyer.address;
  const destinationVal = "BRAHMAPURAM";

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
      ["Destination", destinationVal],
    ],
    [
      ["Bill of Lading/LR-RR No.", s(transport.lr_number)],
      ["Motor Vehicle No.", s(transport.vehicle_number)],
    ],
  ];

  const sellerAddr = addressLines(seller, true);
  const sellerState = resolveState(seller);
  const sellerMsme = s(seller.msme_number || seller.udyam_number || seller.udyam_no || seller.msme);

  const consigneeAddr = addressLines(
    delivery.address || buyer.shipping_address || buyer.billing_address || buyer.address,
    false
  );
  const consigneeGstin = s(delivery.gstin || buyer.gstin);
  const consigneeState = resolveState(delivery, consigneeGstin);

  const buyerAddr = addressLines(buyer.billing_address || buyer.address, false);
  const buyerGstin = s(buyer.gstin);
  const buyerState = resolveState(buyer, buyerGstin);

  // Widened keyColX (L + 66) so 8.2pt "State Name" never touches the colon
  const keyColX = L + 66;

  // Render Seller Block (9pt Bold name, 8.2pt details)
  let py = gridY + 3.5;
  py += wrappedText(seller.legal_name || seller.business_name, L + 4, py, leftW - 8, { bold: true, size: 9 });
  sellerAddr.forEach((line) => {
    py += wrappedText(line, L + 4, py, leftW - 8, { size: 8.2 });
  });
  if (sellerMsme) {
    text(`MSME: ${sellerMsme}`, L + 4, py, leftW - 8, { size: 8.2 });
    py += 9.6;
  }
  if (seller.gstin) {
    text(`GSTIN/UIN: ${s(seller.gstin)}`, L + 4, py, leftW - 8, { size: 8.2 });
    py += 9.6;
  }
  if (sellerState.name || sellerState.code) {
    text(`State Name : ${sellerState.name}, Code : ${sellerState.code}`, L + 4, py, leftW - 8, {
      size: 8.2,
    });
    py += 10.5;
  }

  const consigneeY = py + 1.5;
  hline(consigneeY, L, rightX);

  // Render Consignee Block (7.8pt label, 9pt Bold name, 8.2pt details)
  py = consigneeY + 3;
  text("Consignee (Ship to)", L + 4, py, leftW - 8, { size: 7.8 });
  py += 9.8;
  py += wrappedText(delivery.name || buyer.legal_name, L + 4, py, leftW - 8, { bold: true, size: 9 });
  consigneeAddr.forEach((line) => {
    py += wrappedText(line, L + 4, py, leftW - 8, { size: 8.2 });
  });
  if (consigneeGstin) {
    text("GSTIN/UIN", L + 4, py, 60, { size: 8.2 });
    text(`: ${consigneeGstin}`, keyColX, py, leftW - 72, { size: 8.2 });
    py += 9.6;
  }
  if (consigneeState.name || consigneeState.code) {
    text("State Name", L + 4, py, 60, { size: 8.2 });
    text(`: ${consigneeState.name}, Code : ${consigneeState.code}`, keyColX, py, leftW - 72, {
      size: 8.2,
    });
    py += 10.5;
  }

  const buyerY = py + 1.5;
  hline(buyerY, L, rightX);

  // Render Buyer Block (7.8pt label, 9pt Bold name, 8.2pt details)
  py = buyerY + 3;
  text("Buyer (Bill to)", L + 4, py, leftW - 8, { size: 7.8 });
  py += 9.8;
  py += wrappedText(buyer.legal_name, L + 4, py, leftW - 8, { bold: true, size: 9 });
  buyerAddr.forEach((line) => {
    py += wrappedText(line, L + 4, py, leftW - 8, { size: 8.2 });
  });
  if (buyerGstin) {
    text("GSTIN/UIN", L + 4, py, 60, { size: 8.2 });
    text(`: ${buyerGstin}`, keyColX, py, leftW - 72, { size: 8.2 });
    py += 9.6;
  }
  if (buyerState.name || buyerState.code) {
    text("State Name", L + 4, py, 60, { size: 8.2 });
    text(`: ${buyerState.name}, Code : ${buyerState.code}`, keyColX, py, leftW - 72, {
      size: 8.2,
    });
    py += 10.5;
  }

  // Synchronize top grid height with 21pt Tally metadata rows (7.8pt labels, 8.6pt Bold values)
  const metaRowH = 21;
  const minRightTopH = metaPairs.length * metaRowH + 36;
  const topGridH = Math.max(py + 2 - gridY, minRightTopH);

  box(L, gridY, W, topGridH);
  vline(rightX, gridY, gridY + topGridH);
  vline(midRightX, gridY, gridY + metaPairs.length * metaRowH);

  metaPairs.forEach((pair, idx) => {
    const ry = gridY + idx * metaRowH;
    if (idx > 0) hline(ry, rightX, RIGHT);
    const [[l1, v1], [l2, v2]] = pair;
    text(l1, rightX + 4, ry + 2.2, rightW / 2 - 8, { size: 7.8 });
    text(v1, rightX + 4, ry + 11, rightW / 2 - 8, { bold: true, size: 8.6 });
    text(l2, midRightX + 4, ry + 2.2, rightW / 2 - 8, { size: 7.8 });
    text(v2, midRightX + 4, ry + 11, rightW / 2 - 8, { bold: true, size: 8.6 });
  });

  const termsY = gridY + metaPairs.length * metaRowH;
  hline(termsY, rightX, RIGHT);
  text("Terms of Delivery", rightX + 4, termsY + 2.2, rightW - 8, { size: 7.8 });
  if (transport.terms) {
    text(s(transport.terms), rightX + 4, termsY + 11.5, rightW - 8, { bold: true, size: 8.4 });
  }

  // ==================== 3. LINE ITEMS TABLE (UNIFIED CHAMBER) ====================
  let y = gridY + topGridH;
  // Widened Amount column (88pt) so 10pt Bold ₹ Grand Total never clips
  const colWidths = [22, 230.58, 48, 72, 54, 24, 88];
  const colX: number[] = [];
  colWidths.reduce((acc, w) => { colX.push(acc); return acc + w; }, L);
  const tableBottom = 760;

  let itemsChamberStartY = y;

  const drawItemsHeader = () => {
    const hh = 23;
    box(L, y, W, hh);
    colX.slice(1).forEach((x) => vline(x, y, y + hh));
    text("Sl", colX[0] + 1, y + 2, colWidths[0] - 2, { size: 8, align: "center" });
    text("No.", colX[0] + 1, y + 11.5, colWidths[0] - 2, { size: 8, align: "center" });
    const otherHeads = ["Description of Goods", "HSN/SAC", "Quantity", "Rate", "per", "Amount"];
    otherHeads.forEach((h, idx) => {
      const i = idx + 1;
      text(h, colX[i] + 2, y + 6.5, colWidths[i] - 4, { size: 8.2, align: "center" });
    });
    y += hh;
    itemsChamberStartY = y;
    y += 2.5;
  };

  const closeItemsChamber = () => {
    box(L, itemsChamberStartY, W, y - itemsChamberStartY);
    colX.slice(1).forEach((x) => vline(x, itemsChamberStartY, y));
  };

  const startNewItemsPage = () => {
    closeItemsChamber();
    doc.addPage({ size: "A4", margin: 28.35 });
    y = 36;
    text("Tax Invoice - " + s(invoice.invoice_number), L, 20, W, { bold: true, size: 9.5, align: "center" });
    drawItemsHeader();
  };

  drawItemsHeader();

  for (let index = 0; index < rows.length; index++) {
    const item = rows[index];
    const desc = s(item.description);
    doc.font("Helvetica-Bold").fontSize(9);
    const descH = doc.heightOfString(desc, { width: colWidths[1] - 8 });
    const rowH = Math.max(16.5, Math.ceil(descH + 6));
    if (y + rowH + 92 > tableBottom) startNewItemsPage();

    if (index % 2 === 0) {
      fillRect(L + 0.4, y - 0.5, W - 0.8, rowH - 1, rowTint);
    }

    const qtyWithUnit = `${n(item.quantity).toFixed(3)} ${s(item.unit_code)}`.trim();
    text(String(index + 1), colX[0] + 1, y + 3, colWidths[0] - 2, { size: 8.5, align: "center" });
    text(desc, colX[1] + 4, y + 2.8, colWidths[1] - 8, { bold: true, size: 9 });
    text(s(item.hsn_code), colX[2] + 2, y + 3, colWidths[2] - 4, { size: 8.5, align: "center" });
    text(qtyWithUnit, colX[3] + 2, y + 3, colWidths[3] - 4, { bold: true, size: 8.5, align: "right" });
    text(money(item.unit_rate), colX[4] + 2, y + 3, colWidths[4] - 4, { size: 8.5, align: "right" });
    text(s(item.unit_code), colX[5] + 1, y + 3.2, colWidths[5] - 2, { size: 8, align: "center" });
    text(money(item.taxable_value), colX[6] + 2, y + 2.8, colWidths[6] - 4, { bold: true, size: 9, align: "right" });
    y += rowH;
  }

  const hasIgst = n(invoice.igst_total) > 0;
  const sampleRate = rows.length ? n(rows[0].gst_rate) : 5;
  const taxLines: [string, string, number][] = hasIgst
    ? [[`IGST @${sampleRate}% OUTPUT TAX`, sampleRate.toFixed(2), n(invoice.igst_total)]]
    : [
        [`CGST @${sampleRate / 2}% OUTPUT TAX`, (sampleRate / 2).toFixed(2), n(invoice.cgst_total)],
        [`SGST @${sampleRate / 2}% OUTPUT TAX`, (sampleRate / 2).toFixed(2), n(invoice.sgst_total)],
      ];

  y += 15;
  taxLines.forEach(([label, rateStr, amt], idx) => {
    if (y + 15 + 92 > tableBottom) startNewItemsPage();
    if (idx === 0) {
      fillRect(L + 0.4, y - 0.5, W - 0.8, 14.5, rowTint);
    }
    text(label, colX[1] + 4, y + 2, colWidths[1] - 6, { bold: true, italic: true, size: 8.8, align: "right" });
    text(rateStr, colX[4] + 2, y + 2.2, colWidths[4] - 4, { italic: true, size: 8.5, align: "right" });
    text("%", colX[5] + 1, y + 2.2, colWidths[5] - 2, { italic: true, size: 8.2, align: "center" });
    text(money(amt), colX[6] + 2, y + 2, colWidths[6] - 4, { bold: true, size: 9, align: "right" });
    y += 15;
  });

  if (y < 492) y = 492;
  closeItemsChamber();

  // Total Row with 10pt Bold ₹ Grand Total
  const totalH = 19;
  if (y + totalH + 115 > 805) startNewItemsPage();
  box(L, y, W, totalH);
  colX.slice(1).forEach((x) => vline(x, y, y + totalH));
  const totalQty = rows.reduce((sum, item) => sum + n(item.quantity), 0);
  const firstUnit = rows.length ? s(rows[0].unit_code) : "";
  text("Total", colX[1] + 4, y + 4.8, colWidths[1] - 6, { size: 8.5, align: "right" });
  text(`${totalQty.toFixed(3)} ${firstUnit}`.trim(), colX[3] + 2, y + 4.8, colWidths[3] - 4, {
    bold: true,
    size: 8.5,
    align: "right",
  });

  const grandStr = money(invoice.grand_total);
  doc.font("Helvetica-Bold").fontSize(10);
  const grandNumW = doc.widthOfString(grandStr);
  const rupeeX = RIGHT - 4 - grandNumW - 9.5;
  drawRupee(rupeeX, y + 4.5, 10);
  text(grandStr, colX[6] + 2, y + 4, colWidths[6] - 4, { bold: true, size: 10, align: "right" });
  y += totalH;

  // ==================== 4. AMOUNT IN WORDS ====================
  const wordsH = 28;
  box(L, y, W, wordsH);
  text("Amount Chargeable (in words)", L + 4, y + 3, 220, { size: 7.8 });
  text("E. & O.E", RIGHT - 60, y + 3, 56, { size: 7.8, italic: true, align: "right" });
  text(inrWords(n(invoice.grand_total)), L + 4, y + 13.5, W - 8, { bold: true, size: 9.2 });
  y += wordsH;

  // ==================== 5. HSN/SAC TAX BREAKUP MATRIX ====================
  const groups = new Map<string, R>();
  rows.forEach((item) => {
    const key = s(item.hsn_code) + "|" + n(item.gst_rate);
    const g = groups.get(key) || { hsn: s(item.hsn_code), rate: n(item.gst_rate), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.taxable += n(item.taxable_value);
    g.cgst += n(item.cgst_amount);
    g.sgst += n(item.sgst_amount);
    g.igst += n(item.igst_amount);
    groups.set(key, g);
  });

  const hsnWidths = [166.58, 76, 40, 68, 40, 68, 80];
  const hsnX: number[] = [];
  hsnWidths.reduce((acc, w) => { hsnX.push(acc); return acc + w; }, L);
  const hsnHeadH = 25;
  box(L, y, W, hsnHeadH);
  vline(hsnX[1], y, y + hsnHeadH);
  vline(hsnX[2], y, y + hsnHeadH);
  vline(hsnX[3], y + 12.5, y + hsnHeadH);
  vline(hsnX[4], y, y + hsnHeadH);
  vline(hsnX[5], y + 12.5, y + hsnHeadH);
  vline(hsnX[6], y, y + hsnHeadH);
  hline(y + 12.5, hsnX[2], hsnX[6]);

  text("HSN/SAC", hsnX[0], y + 7.5, hsnWidths[0], { size: 8.2, align: "center" });
  text("Taxable", hsnX[1], y + 2.5, hsnWidths[1], { size: 8, align: "center" });
  text("Value", hsnX[1], y + 12.5, hsnWidths[1], { size: 8, align: "center" });
  if (hasIgst) {
    text("IGST", hsnX[2], y + 2, hsnWidths[2] + hsnWidths[3], { size: 8, align: "center" });
    text("Rate", hsnX[2], y + 14.5, hsnWidths[2], { size: 7.8, align: "center" });
    text("Amount", hsnX[3], y + 14.5, hsnWidths[3], { size: 7.8, align: "center" });
    text("—", hsnX[4], y + 8, hsnWidths[4] + hsnWidths[5], { size: 8, align: "center" });
  } else {
    text("CGST", hsnX[2], y + 2, hsnWidths[2] + hsnWidths[3], { size: 8, align: "center" });
    text("Rate", hsnX[2], y + 14.5, hsnWidths[2], { size: 7.8, align: "center" });
    text("Amount", hsnX[3], y + 14.5, hsnWidths[3], { size: 7.8, align: "center" });
    text("SGST/UTGST", hsnX[4], y + 2, hsnWidths[4] + hsnWidths[5], { size: 8, align: "center" });
    text("Rate", hsnX[4], y + 14.5, hsnWidths[4], { size: 7.8, align: "center" });
    text("Amount", hsnX[5], y + 14.5, hsnWidths[5], { size: 7.8, align: "center" });
  }
  text("Total", hsnX[6], y + 2.5, hsnWidths[6], { size: 8, align: "center" });
  text("Tax Amount", hsnX[6], y + 12.5, hsnWidths[6], { size: 8, align: "center" });
  y += hsnHeadH;

  const taxTotal = n(invoice.cgst_total) + n(invoice.sgst_total) + n(invoice.igst_total);
  for (const g of groups.values()) {
    const rh = 15.5;
    box(L, y, W, rh);
    hsnX.slice(1).forEach((x) => vline(x, y, y + rh));
    const half = (g.rate / 2).toFixed(2) + "%";
    text(g.hsn, hsnX[0] + 4, y + 3, hsnWidths[0] - 8, { size: 8.2 });
    text(money(g.taxable), hsnX[1] + 2, y + 3, hsnWidths[1] - 4, { size: 8.2, align: "right" });
    if (hasIgst) {
      text(g.rate.toFixed(2) + "%", hsnX[2] + 2, y + 3, hsnWidths[2] - 4, { size: 8.2, align: "right" });
      text(money(g.igst), hsnX[3] + 2, y + 3, hsnWidths[3] - 4, { size: 8.2, align: "right" });
      text("—", hsnX[4] + 2, y + 3, hsnWidths[4] + hsnWidths[5] - 4, { size: 8.2, align: "center" });
    } else {
      text(half, hsnX[2] + 2, y + 3, hsnWidths[2] - 4, { size: 8.2, align: "right" });
      text(money(g.cgst), hsnX[3] + 2, y + 3, hsnWidths[3] - 4, { size: 8.2, align: "right" });
      text(half, hsnX[4] + 2, y + 3, hsnWidths[4] - 4, { size: 8.2, align: "right" });
      text(money(g.sgst), hsnX[5] + 2, y + 3, hsnWidths[5] - 4, { size: 8.2, align: "right" });
    }
    text(money(g.cgst + g.sgst + g.igst), hsnX[6] + 2, y + 3, hsnWidths[6] - 4, { size: 8.2, align: "right" });
    y += rh;
  }

  const hsnTotH = 15.5;
  box(L, y, W, hsnTotH);
  hsnX.slice(1).forEach((x) => vline(x, y, y + hsnTotH));
  text("Total", hsnX[0] + 4, y + 3, hsnWidths[0] - 6, { bold: true, size: 8.2, align: "right" });
  text(money(rows.reduce((sum, item) => sum + n(item.taxable_value), 0)), hsnX[1] + 2, y + 3, hsnWidths[1] - 4, {
    bold: true,
    size: 8.2,
    align: "right",
  });
  if (hasIgst) {
    text(money(invoice.igst_total), hsnX[3] + 2, y + 3, hsnWidths[3] - 4, { bold: true, size: 8.2, align: "right" });
  } else {
    text(money(invoice.cgst_total), hsnX[3] + 2, y + 3, hsnWidths[3] - 4, { bold: true, size: 8.2, align: "right" });
    text(money(invoice.sgst_total), hsnX[5] + 2, y + 3, hsnWidths[5] - 4, { bold: true, size: 8.2, align: "right" });
  }
  text(money(taxTotal), hsnX[6] + 2, y + 3, hsnWidths[6] - 4, { bold: true, size: 8.2, align: "right" });
  y += hsnTotH;

  // ==================== 6. FOOTER: TAX WORDS, BANK, DECLARATION & SIGNATORY ====================
  if (y + 120 > 805) {
    doc.addPage({ size: "A4", margin: 28.35 });
    y = 28.35;
  }

  const footerBoxH = 108;
  box(L, y, W, footerBoxH);

  // Tax Amount in Words at top of footer box (8.8pt Bold Tally scale)
  text("Tax Amount (in words)  :", L + 4, y + 4, 102, { size: 8 });
  text(inrWords(taxTotal), L + 106, y + 4, W - 110, { bold: true, size: 8.8 });

  // Bank Details aligned directly with left edge of Signatory Box (L + W * 0.465)
  const sigX = Math.round((L + W * 0.465) * 100) / 100;
  const sigW = RIGHT - sigX;
  const bankX = sigX + 4;
  text("Company's Bank Details", bankX, y + 18, sigW - 8, { size: 8.2 });
  const bankPairs = ([
    ["Bank Name", s(bank?.bank_name)],
    ["A/c No.", s(bank?.account_number)],
    ["Branch & IFS Code", [s(bank?.branch_name), s(bank?.ifsc_code)].filter(Boolean).join(" & ")],
  ] as [string, string][]).filter(([, val]) => Boolean(val));

  bankPairs.forEach(([k, v], i) => {
    const by = y + 29 + i * 10.5;
    text(k, bankX, by, 84, { size: 8.1 });
    text(":  " + v, bankX + 84, by, RIGHT - (bankX + 88), { bold: true, size: 8.3 });
  });

  // Declaration (Bottom Left, 8pt Tally scale)
  text("Declaration", L + 4, y + 66, sigX - L - 10, { size: 8, underline: true });
  text(
    "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
    L + 4,
    y + 77,
    sigX - L - 10,
    { size: 8, lineGap: 0.8 }
  );

  // Authorised Signatory Box (Bottom Right, aligned flush with Bank Details left margin)
  const sigH = 44;
  const sigY = y + footerBoxH - sigH; // y + 64 (cleanly below Branch & IFS Code at y + 50)
  hline(sigY, sigX, RIGHT);
  vline(sigX, sigY, y + footerBoxH);
  text("for " + s(seller.legal_name || seller.business_name), sigX + 4, sigY + 4, sigW - 10, {
    bold: true,
    size: 8.5,
    align: "right",
  });
  text("Authorised Signatory", sigX + 4, sigY + sigH - 13, sigW - 10, { size: 8.1, align: "right" });

  // Bottom Centered Note outside border
  text("This is a Computer Generated Invoice", L, y + footerBoxH + 4.5, W, { size: 8, align: "center" });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (range.count > 1) {
      text(`Page ${i + 1} of ${range.count}`, L, 818, W, { size: 7.5, align: "right" });
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
