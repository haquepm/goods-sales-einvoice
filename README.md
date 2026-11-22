# Goods Sales e-Invoice Generator

A multi-business application for creating GST goods sales invoices, registering eligible invoices through an authorised Indian e-Invoice IRP integration, and producing compact Tally-style PDFs.

## Product decisions

- Multi-business SaaS: every business has an isolated workspace and business-specific configuration.
- Goods invoices only in the first release.
- Every invoice generated for final issue must complete the configured IRP registration flow; no ordinary non-IRP final invoice mode.
- Manual capture/import of an already-issued IRP response may be supported for reconciliation, but must never be presented as proof of registration unless the IRP response and signed data have been verified.
- Invoice PDF should closely reproduce the supplied compact Tally-style reference: A4 portrait, small readable type, dense bordered tables, aligned header and tax summary.
- Pagination is content-driven: one page when it fits; otherwise continue to further pages with invoice identification repeated as appropriate.
- Excel bulk workflow: one customer is selected before upload and applies to all rows in that batch.
- In the supplied Excel format, `NAME OF SUPPLIER` means material supplier/source, not buyer.
- Each eligible Excel row creates one invoice. Rows with all material quantities zero/blank are skipped and do not consume invoice numbers.
- Only positive-quantity materials become invoice lines.
- Bulk processing must preview accepted and skipped rows before registration; each invoice registers independently, and failures remain visible/retryable.

## Initial stack

- Next.js App Router + TypeScript
- Supabase PostgreSQL, Auth and Storage
- Server-side authorization and database Row Level Security
- ExcelJS for workbook parsing
- A server-side PDF renderer with a print stylesheet/template
- Vercel hosting

Pin dependencies and commit the lockfile during application bootstrap. Never put a Supabase service-role/secret key or IRP credentials in browser code or `NEXT_PUBLIC_*` variables.

## Core modules

1. Business onboarding, memberships and roles
2. Business GST, address, bank and invoice settings
3. Customer and consignee master
4. Goods/product master, HSN, units, GST rates and effective-dated price lists
5. Invoice entry, tax calculation, numbering and validation
6. IRP adapter, registration, signed response verification, retry and cancellation/reconciliation
7. Exact-layout PDF rendering and secure document storage
8. Excel import, column mapping, validation, preview and batch processing
9. Invoice register, reports, audit trail and exports

## Initial data model

All tenant-owned rows must carry `business_id` and have indexes/constraints that support tenant isolation.

- `businesses`
- `business_users`
- `business_gst_settings`
- `business_bank_accounts`
- `customers`
- `products`
- `product_rates`
- `units` (or a controlled unit catalogue)
- `invoices`
- `invoice_items`
- `invoice_tax_summary`
- `invoice_sequences`
- `einvoice_submissions`
- `invoice_documents`
- `bulk_uploads`
- `bulk_upload_rows`
- `bulk_upload_materials`
- `audit_logs`

Implementation detail: store money and quantities as PostgreSQL `numeric` with explicit precision/scale; do not use floating-point arithmetic for invoice totals or tax calculations. Persist immutable snapshots of seller, buyer, consignee, product description, HSN, unit, rate and tax data on issued invoices so later master-data edits do not rewrite history.

## Invoice lifecycle

Suggested states:

`draft -> validated -> pending_irp -> registered -> pdf_generated`

Failures are explicit states (for example `validation_failed` and `irp_failed`) with structured error details and controlled retry. A failed attempt must not silently allocate another invoice number or create a duplicate IRP registration. Use an idempotency strategy keyed to the internal invoice and provider transaction; persist the IRP request/response references and registration result.

Do not mark an invoice as an e-Invoice until registration has succeeded and the IRP-issued IRN, acknowledgement details and signed QR payload have been validated. Actual legal applicability and required payload validation must be checked for each business/transaction under current GST rules. The application must not claim that every possible transaction is legally eligible for IRP registration.

## Bulk Excel mapping (initial template)

| Excel column | Meaning |
|---|---|
| `SL.NO` | Source row reference |
| `DATE` | Delivery date |
| `NAME OF SUPPLIER` | Material supplier/source |
| `VEHICLE NUMBER` | Delivery vehicle number |
| `UNIT` | Quantity unit (example: TON) |
| `12 MM` | 12 MM Aggregate quantity |
| `20 MM` | 20 MM Aggregate quantity |
| `M-SAND` | M-Sand quantity |

Customer/buyer is selected once before upload and applied to every eligible row. The source/supplier column must never be copied into the buyer field. A row is eligible only when at least one configured material quantity is positive. Validate date, unit, source, vehicle and quantities. Show a preview and skipped-row report before processing.

## Security and reliability baseline

- Enable RLS on every table in exposed schemas.
- Authorize access through trusted business membership records, not user-editable JWT metadata.
- Ensure every query and mutation is scoped to the authenticated user's business membership.
- Keep service-role and IRP credentials server-side; prefer a managed secret store.
- Use private Storage buckets and short-lived signed URLs for invoice documents.
- Use atomic database operations for invoice sequence allocation.
- Use idempotency keys and persist each IRP attempt before retrying.
- Maintain append-only audit events for issue, registration, cancellation and administrative changes.
- Define backups, restore tests, retention and export procedures before production use.

## Development sequence

### Milestone 1 — Foundation
- Bootstrap Next.js + TypeScript project and lint/type-check scripts.
- Configure Supabase local development and environment validation.
- Create the first SQL migration for tenant membership and business setup.
- Add RLS policies and automated tenant-isolation tests.

### Milestone 2 — Masters
- Business profile and GST settings
- Customers/consignees
- Products, HSN, units, tax rates and price lists

### Milestone 3 — Invoice engine
- Invoice draft and line items
- CGST/SGST/IGST determination based on place of supply and applicable rules
- Decimal-safe rounding, totals and amount-in-words
- Atomic invoice numbering and validation

### Milestone 4 — IRP integration
- Select an authorised provider and confirm onboarding/credentials
- Implement provider adapter and sandbox registration
- Validate IRP response and signed QR data
- Handle retries, duplicate prevention, cancellation and reconciliation

### Milestone 5 — PDF and bulk upload
- Reproduce the supplied Tally-style invoice reference
- Dynamic page layout and page-break tests
- Excel mapping, preview, row-level validation and batch processing
- Individual PDFs and ZIP export

### Milestone 6 — Production readiness
- Reports, audit trail, monitoring and alerts
- Backup/restore exercise
- Security review, GST/IRP compliance review and user acceptance testing

## Configuration

Create a local `.env.local` from `.env.example`. Never commit real secrets.

## Important scope note

The reference PDFs are visual/layout references only. Seller, buyer, GST, bank and invoice details must be entered independently by each business. This repository is not tied to Crescent Contractors or any sample seller.

## Legal and tax review

The software is a workflow and document-generation tool, not a substitute for professional GST advice. Before production, verify current IRP schema/provider requirements, GST applicability, HSN/tax treatment, invoice numbering, cancellation rules, retention and other statutory requirements with a qualified GST professional and the authorised provider.
