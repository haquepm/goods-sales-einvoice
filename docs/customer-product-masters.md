# Customer and Product Master

## Customer master
- Create customer records within the currently selected business workspace.
- Store legal/trade name, customer code, GSTIN, email, phone, billing address and state code.
- GSTIN is normalised to uppercase and validated against the standard 15-character structure.
- Customer records can be activated or deactivated; records are not physically deleted.
- Duplicate customer codes are prevented by the database's per-business unique constraint.

## Product and material master
- Create goods/material records with SKU, description, HSN, unit, GST rate and default selling rate.
- Product records can be activated or deactivated; records are not physically deleted.
- Duplicate SKUs are prevented by the database's per-business unique constraint.

## Access control
- All reads and writes use the signed-in user's Supabase server client.
- The business ID is resolved from the user's visible business workspaces.
- Customers and products are protected by database RLS membership policies.
- No service-role key is used by these modules.

## Current limitations
- The workspace currently opens the first business returned for the signed-in user. A proper business switcher is a follow-up task for users who own or belong to multiple businesses.
- Address fields are currently captured as a compact address object; dedicated state and country master data will be added with invoice setup.
- Edit-in-place screens and bulk import of customer/product masters are not part of this milestone.
