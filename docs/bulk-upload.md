# Bulk Excel import

## Confirmed source mapping

| Column | Destination meaning |
|---|---|
| SL.NO | Source row reference |
| DATE | Delivery date |
| NAME OF SUPPLIER | Supplier/material source |
| VEHICLE NUMBER | Vehicle number |
| UNIT | Unit of measure |
| 12 MM | 12 MM Aggregate quantity |
| 20 MM | 20 MM Aggregate quantity |
| M-SAND | M-Sand quantity |

The customer/buyer is selected once before uploading and is applied to all rows. Never infer the buyer from `NAME OF SUPPLIER`.

## Eligibility
A row is eligible when at least one configured material quantity is a valid positive number. Zero, blank or empty quantities create no line. If all material quantities are zero/blank, skip the row. Skipped rows do not reserve invoice numbers.

## Preview
Show:
- Source row number and delivery date
- Selected customer
- Supplier/material source
- Vehicle number
- Positive material lines and quantities
- Validation errors/warnings
- Eligible invoice count and skipped row count

No invoice number is allocated during parsing or preview. Allocate numbers only after final validation and immediately before creating durable invoice drafts/registration jobs.

## Processing
Create one invoice for each eligible row. Apply product master rates by default; allow an explicitly selected batch price override policy. Register each invoice independently with the IRP. Preserve row-level statuses, provider references and errors. A retry must reuse the same invoice and idempotency identity; it must not create a duplicate invoice.
