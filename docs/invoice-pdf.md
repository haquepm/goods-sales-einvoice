# Invoice PDF generation

The authenticated route `GET /api/invoices/[id]/pdf` generates an A4 portrait PDF using the invoice's immutable seller/buyer snapshots and saved line-item tax values.

## Layout
- Compact, bordered Tally-style invoice.
- Seller and invoice metadata, invoice number/date/financial year.
- Buyer (bill-to), consignee (ship-to), place of supply and dispatch/transport details.
- Goods lines with HSN, quantity, unit rate, taxable value, GST rate and line total.
- Invoice totals, amount in words and HSN/rate-wise tax summary.
- Default business bank account, declaration and authorised-signatory area.
- Automatic continuation pages and page numbering.
- IRN and acknowledgement details plus provider-signed QR code only when the invoice status is `irp_registered`.

## Draft safety
- Any invoice not successfully registered by the IRP is prominently marked `DRAFT - NOT A TAX INVOICE`.
- The route does not create an IRN or QR code and does not change invoice status.
- PDF access requires a signed-in user and a business-visible invoice; database RLS remains in force.
- PDF response is private and non-cacheable.

## Reference basis
The accessible sample in `5027 TO 5382 CR (1).pdf` shows the Tally-style arrangement, including IRN/acknowledgement, seller details, invoice metadata, consignee and bill-to blocks, vehicle/destination, goods table, HSN tax summary, bank details, declaration and signatory. The separately named `Cresent Invoice.pdf` reference was not available in the Library search at implementation time; this implementation follows the accessible sample and should be visually reconciled against the original if re-uploaded.
