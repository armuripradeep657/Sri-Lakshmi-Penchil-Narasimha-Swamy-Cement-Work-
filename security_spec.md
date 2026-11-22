# Security Specification — SLP Billing

## 1. Data Invariants
1. **Business Isolation**: Every operational record (`products`, `categories`, `customers`, `bills`, `billItems`, `payments`, `invoices`, `inventoryTransactions`, `upiSettings`, `notifications`, `messageLogs`, `businessSettings`, `auditLogs`, `devices`) belongs to a valid existing `businessId`, carries `ownerUid`, and maintains a bounded `authorizedUids` array (`1..25` elements) matching authorized business members.
2. **Email Verification Mandate**: All authenticated reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Role Integrity (Zero Self-Escalation)**: Only the bootstrapped verified admin (`armuripradeepkumar@gmail.com`) or an existing verified admin listed in `/admins/{uid}` can create or modify `admins`, `users` roles/statuses, `businesses`, `businessSettings`, `upiSettings`, or revoke `devices`. Cashiers cannot modify their own `role` or `status`.
4. **Financial Immutability & Auditability**: `payments`, `inventoryTransactions`, and `auditLogs` are append-only (no `delete`; `payments` cannot be overwritten once recorded). `bills` cannot be hard-deleted; cancellations and refunds update `billStatus` / `paymentStatus` via explicit allowlisted transitions and require an `auditLog` entry.
5. **Temporal Integrity**: All `createdAt` and `updatedAt` fields are strictly validated against `request.time`.
6. **Public Invoice Token Safety**: `publicInvoices/{token}` strictly forbids `list` (`allow list: if false;`), requires a valid `token` format (`16..128` chars), and rejects `get` when `revoked == true`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unverified Email Spoof**: Authenticated user with `email: 'armuripradeepkumar@gmail.com'` and `email_verified: false` attempts to write `/businesses/slp_main`. -> `PERMISSION_DENIED`.
2. **Self-Privilege Escalation**: Cashier attempts to create `/users/{uid}` with `role: 'admin'`. -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Bill**: Authorized user creates `/bills/bill_1` including extra ghost field `isVerified: true`. -> `PERMISSION_DENIED` (`hasOnly` check).
4. **ID Poisoning Attack**: Attacker sends a 1,500-character document ID to `/products/{1500chars}`. -> `PERMISSION_DENIED` (`isValidId` fails).
5. **Client-Spoofed Timestamp**: User submits `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` (`request.time`). -> `PERMISSION_DENIED`.
6. **Public Invoice Enumeration (`list`)**: Unauthenticated or external user executes `getDocs(collection(db, 'publicInvoices'))`. -> `PERMISSION_DENIED` (`allow list: if false`).
7. **Revoked Public Invoice Access**: Customer requests `getDoc(doc(db, 'publicInvoices', revokedToken))` where `revoked == true`. -> `PERMISSION_DENIED`.
8. **Cross-Tenant Query Scraping**: External signed-in user executes `getDocs(collection(db, 'customers'))`. -> `PERMISSION_DENIED` (`allow list` requires `request.auth.uid in resource.data.authorizedUids` or boot admin).
9. **Audit Log Tampering**: Cashier or external user attempts to `update` or `delete` `/auditLogs/log_1`. -> `PERMISSION_DENIED`.
10. **Cancelled Bill Overwrite**: Cashier attempts to change `grandTotal` or `billStatus` back to `active` on a `cancelled` bill. -> `PERMISSION_DENIED`.
11. **Unbounded Array Resource Attack**: Attacker submits `authorizedUids` with 100 entries or non-string entries `[123]`. -> `PERMISSION_DENIED`.
12. **Orphaned Bill Creation**: Attacker creates `/bills/bill_99` referencing a non-existent `businessId: 'fake_biz'`. -> `PERMISSION_DENIED` (`exists` check fails).
