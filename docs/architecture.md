# Architecture notes

## Tenant boundary
A business is the tenant. Users join businesses through `business_users`, which stores a role and membership state. A user may belong to multiple businesses. Every tenant-owned row includes `business_id`. RLS should verify membership with a narrowly scoped helper and enforce tenant predicates for SELECT/INSERT/UPDATE/DELETE.

## Data ownership
- Platform administration: global account provisioning and support operations, separated from normal business membership.
- Business owner/admin: business settings, members, masters, invoices and reports for that business.
- Accountant/operator: invoice and customer/product operations as explicitly granted.
- Read-only: viewing and downloading within the business.

## Invoice integrity
An invoice stores a snapshot of all legal and commercial details used at issue time. Issued/registered invoices are immutable except for explicitly modelled lifecycle events such as cancellation/credit/debit note workflows. Corrections must not rewrite the original IRP payload.

## Registration boundary
Use a server-side provider adapter. Keep provider-specific payload mapping outside UI components. Persist a submission attempt and idempotency key before making a network call. Verify provider response signature/QR data according to the provider's documented process. Never treat user-supplied IRN text or an uploaded QR image alone as proof of successful registration.

## PDF rendering
Create an invoice view model from immutable invoice snapshots and verified IRP response data. The print template should use A4 portrait, compact typography and dense table borders matching the supplied Tally-style reference. Use content-driven pagination; do not force two pages. Test one-line, many-line and long-description invoices.

## Bulk upload
A batch has one selected customer. Supplier/material source is a separate field. Parse raw spreadsheet rows into staging records first; validate and preview before allocating invoice numbers. Only rows with at least one positive material quantity are eligible. Process each invoice independently so one IRP failure does not obscure successful rows.
