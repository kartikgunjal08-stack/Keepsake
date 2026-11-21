# Keepsake Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Creator Ownership & PII Isolation:** Only the authenticated, email-verified user (`request.auth.uid == creatorId` and `request.auth.token.email_verified == true`) can read or write `/creators/{creatorId}`.
2. **Initial Quota Integrity:** On creation, `/creators/{creatorId}` MUST initialize with `siteCredits == 1`, `publishedCount == 0`, `hasUnlimitedPass == false`, `createdAt == request.time`, and `updatedAt == request.time`.
3. **Payment Tier Transitions:**
   - **₹9 Single-Site Credit (`buySingleCredit`):** Can only increment `siteCredits` by `+1`, update `lastUtrRef` (6..40 chars), and update `updatedAt == request.time`. Cannot alter `hasUnlimitedPass` or `publishedCount`.
   - **₹99 Unlimited Pass (`buyUnlimitedPass`):** Can only set `hasUnlimitedPass == true`, update `lastUtrRef` (6..40 chars), and update `updatedAt == request.time`. Cannot alter `siteCredits` or `publishedCount`.
4. **Atomic Publish Enforcement (`consumePublish` + `gifts/{slug}` create):**
   - Creating a gift in `/gifts/{slug}` MUST happen in the same atomic batch as updating `/creators/{creatorId}` (`consumePublish`).
   - `publishedCount` MUST increment by `+1`.
   - If `hasUnlimitedPass == false`, `siteCredits` MUST be `>= 1` before publishing and decrement by `-1` atomically (`getAfter`).
   - `creatorId` on `/gifts/{slug}` MUST equal `request.auth.uid`.
5. **Public Shareability without Scraping:** Recipients can `get` a single `/gifts/{slug}` by exact slug without signing in, but `list` queries on `/gifts` are strictly locked to `isSignedIn() && resource.data.creatorId == request.auth.uid`.

## 2. Dirty Dozen Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Creator Read:** `get /creators/uid_123` with `auth == null` -> DENIED.
2. **Cross-User Creator Read (PII Leak):** `get /creators/victim_uid` as `attacker_uid` -> DENIED.
3. **Self-Granted Free Unlimited on Signup:** `create /creators/attacker_uid` with `hasUnlimitedPass: true` -> DENIED.
4. **Self-Granted Free Credits on Signup:** `create /creators/attacker_uid` with `siteCredits: 99` -> DENIED.
5. **Shadow / Ghost Field Injection:** `create /creators/attacker_uid` with extra `isAdmin: true` -> DENIED (`hasOnly`).
6. **Unverified Email Bypass:** `create /creators/attacker_uid` with `email_verified: false` -> DENIED.
7. **Free-Credit Inflation without Payment Action:** `update /creators/attacker_uid` setting `siteCredits: 50` -> DENIED (`siteCredits == existing + 1` enforced).
8. **Empty/Fake Short UTR on ₹99 Unlock:** `update /creators/attacker_uid` with `hasUnlimitedPass: true, lastUtrRef: "1"` -> DENIED.
9. **Orphan Gift Publish Bypassing Quota:** `create /gifts/my-slug` without atomically updating `/creators/{uid}` -> DENIED (`getAfter` invariant).
10. **Gift Spoofing Another Creator:** `create /gifts/my-slug` with `creatorId: "someone_else"` -> DENIED.
11. **Collection Scrape (`list /gifts`):** `list /gifts` as unauthenticated user or querying another creator's gifts -> DENIED.
12. **ID Poisoning / Oversized Payload:** `create /gifts/${'a'.repeat(200)}` or `headline` > 200 chars -> DENIED.
