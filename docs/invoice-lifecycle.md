# Invoice lifecycle and controls

Proposed internal states:
- `draft`
- `validated`
- `pending_irp`
- `registered`
- `pdf_generated`
- `validation_failed`
- `irp_failed`
- `cancelled` (only after a valid cancellation workflow)

The final customer-facing issued invoice requires successful IRP registration. Store IRN, acknowledgement number/date, signed QR payload and provider response references. Preserve request/response audit records with secrets redacted.

Use database transactions and unique constraints for invoice-number allocation. Use provider idempotency where supported, plus an internal unique submission key. Before retrying an ambiguous timeout, query provider status using the original transaction/reference; do not blindly submit a new registration request.

Manual reconciliation is allowed only for a genuine IRP-issued invoice and must include verification evidence. Manual data entry must not create a false registered status.
