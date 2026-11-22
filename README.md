# Goods Sales Invoice Generator

A multi-tenant goods sales invoicing application built with Next.js, Supabase and PostgreSQL. It supports business onboarding, customer and product masters, GST invoice calculations, bulk Excel invoice generation, a Tally-style PDF and an invoice issue workflow.

## Product scope

- Goods sales invoices only.
- No IRP API integration or automatic government registration.
- Each invoice receives an automatically generated 64-character reference (generated_irn) and a sequential business invoice number.
- The generated reference is an application-generated invoice identifier; it is not fetched from a government IRP.
- Businesses maintain their own seller GST profile, address and bank details.
- Each Excel batch selects one buyer/customer. The spreadsheet's NAME OF SUPPLIER is treated as the material source, not the buyer.
- Each eligible row generates one draft invoice. Rows with all material quantities blank/zero are skipped and do not consume invoice numbers.
- Draft invoices can be reviewed and issued from the invoice detail screen.
- Issued invoices are downloadable as A4 PDFs. Draft PDFs are clearly marked as drafts.

## Technology

- Next.js 15 App Router, React 19 and TypeScript
- Supabase Auth, PostgreSQL, Row Level Security and server-side RPC
- ExcelJS for .xlsx parsing
- PDFKit and QRCode for PDF output
- GitHub Actions: TypeScript check, ESLint and production build

## Implemented modules

1. Email/password authentication and business onboarding
2. Tenant-scoped business membership and roles
3. Business profile, GST and bank settings
4. Customer master
5. Goods/product master with HSN, unit, GST rate and default rate
6. Invoice creation with atomic numbering and server-side tax calculation
7. Invoice register, detail review and issue action
8. Automatic unique 64-character invoice reference
9. A4 Tally-style PDF with seller/buyer snapshots, tax summary, bank details and pagination
10. Excel bulk import with customer selection, product mapping, row validation, preview and per-row invoice generation
11. Business audit log entries for invoice creation and issue

## Not yet implemented

- Multi-business workspace switcher (current screens resolve the first business membership for a user)
- Price lists and effective-dated rates
- Full consignee/customer address management
- Sales reports, GST returns, e-way bill generation and accounting exports
- Invoice edit/revision, credit notes and cancellation workflow
- Cloud document archive / ZIP export
- Automated end-to-end browser tests and production UAT
- Deployment to a production domain

## Database

The app's tenant tables are in the existing Supabase project iqltunrvlosxdxucibef (Mumbai region). This project also contains an unrelated Crescent subcontractor billing application. The goods invoicing app uses its own tables and policies; existing subcontractor billing tables were not modified.

Migrations currently committed:

1. 202611220001_initial_tenant_foundation.sql
2. 202611220002_business_owner_bootstrap.sql
3. 202611220003_goods_sales_operations.sql
4. 202611220004_tenant_integrity_guards.sql
5. 202611220005_restrict_tenant_helper_rpc.sql
6. 202611220006_private_tenant_helpers_and_grants.sql
7. 202611220007_business_onboarding_rpc.sql
8. 202611220008_atomic_goods_invoice_draft.sql
9. 202611220009_generated_invoice_reference.sql
10. 202611220010_invoice_issue_status.sql

All goods invoicing tables have RLS enabled. Cross-business invoice/customer/product relationships are guarded by constraints and triggers. Invoice numbering is allocated atomically in PostgreSQL.

## Local development

1. Install Node.js 22 or newer.
2. Clone this repository.
3. Copy .env.example to .env.local.
4. Add the Supabase project URL and publishable key.
5. Configure Supabase Auth Site URL and redirect URL to include http://localhost:3000/auth/callback.
6. Run npm install and npm run dev.
7. Open http://localhost:3000.

Required environment variables:

- NEXT_PUBLIC_SUPABASE_URL=https://iqltunrvlosxdxucibef.supabase.co
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
- NEXT_PUBLIC_APP_URL=http://localhost:3000

Never use a Supabase service-role/secret key in a NEXT_PUBLIC_* variable or commit credentials to Git.

## Verification and production checklist

- Run npm run typecheck, npm run lint and npm run build.
- Configure Supabase Auth redirect URLs for the deployed domain.
- Add the environment variables to the hosting provider.
- Complete business profile, GST details, customers, products and bank account setup.
- Test intra-state and inter-state tax calculations with a GST professional.
- Run a complete single invoice and Excel batch UAT using test data.
- Confirm the deployed app uses HTTPS, private access and appropriate backup/restore settings.

The application is a document and workflow tool. Businesses remain responsible for confirming GST applicability, tax rates, HSN classification, invoice content and statutory requirements with their tax adviser.
