# Forward-in address — setup and design

**Status:** code shipped and verified end to end; **dark in production until the DNS and env steps
below are done.** The webhook answers 503 without `INBOUND_WEBHOOK_SECRET` rather than accepting
unsigned mail.

## Why

Gmail OAuth needs `gmail.readonly`, a restricted scope. Until Google verification (privacy policy,
homepage, demo video, CASA assessment) that means two hard limits: refresh tokens die after 7 days,
and **nobody outside the test-user list can connect at all**. Forwarding has none of that, and it
reaches mailboxes we will never build an OAuth app for — Outlook, iCloud, a work address.

## What you have to do

1. **Resend → Domains → add `in.gatheredos.com`** and publish the MX records it gives you. Use a
   subdomain, not the apex: the apex MX belongs to whatever sends your outbound mail.
2. **Resend → Webhooks → add endpoint** `https://gatheredos.com/api/inbound/email`, subscribed to
   the inbound-email event. Copy the signing secret (`whsec_...`).
3. **Vercel env** (production): `INBOUND_WEBHOOK_SECRET=whsec_...`, and
   `INBOUND_EMAIL_DOMAIN=in.gatheredos.com` if it ever differs from the default. Mark the secret
   **Sensitive**.
4. Redeploy, then Settings → Connected sources → **Get address**, and forward one contractor email
   to it.

Auto-forwarding, once it works manually: Gmail Settings → Forwarding → add the address. Gmail mails
a confirmation code to it, which GatheredOS will classify as "not about work at this home" and skip
— so read the code out of `imported_messages` (or just use a filter that forwards matching mail,
which needs no confirmation for the common case of forwarding *some* mail).

## Design

**The token is the credential.** `h-<16 chars>@in.gatheredos.com`, ~78 bits, from an alphabet with
`i/l/o/0/1` removed because people retype these into mail clients. Anything that can post to the
address writes to that home's memory, so it is random rather than derived from `home_id`, and
rotating it revokes the old address the instant the row changes.

**It lives in its own table.** `home_inbound_addresses`, with a select policy restricted to
owner/family. On `homes` it would have been readable by guests — RLS is row-level, so any policy
that lets a guest see the home exposes every column. Guests are deliberately read-only, and this is
a *write* credential: a guest holding it could do by mail exactly what the role gate stops them
doing in the app. Column-level GRANTs would have fixed the read but broken every `select('*')` on
homes.

**Forwarding is a delivery mechanism, not a second product.** From `extractEmail` onward it is the
identical path to the Gmail sync: same prompt, same identity-confidence rules, same proposal
routing, same cascade, same review queue. `adaptInbound` reshapes the payload into the
`GmailMessage` the pipeline already speaks. Attachments were the only real difference — Gmail hands
back an id to fetch, an inbound webhook delivers bytes inline — so `fileAttachments` now takes a
bytes resolver and both sources share it.

**Unwrapping is the part that makes it work at all.** A forwarded message arrives *from the
homeowner*, and the contractor-identity rule keys on the sender. Ingesting a forward as-is
reintroduces the very first bug real mail found: unreadable invoice + wrong sender = contractor
scored below the floor and discarded. `unwrapForwarded()` recovers the original From/Subject/Date
from the quoted header block (Gmail, Apple Mail and Outlook formats) and hands the pipeline the
original message.

Trust note: those recovered headers are body text, so they are attacker-controlled in a way a real
envelope sender is not — a contractor could mail a homeowner a fake `From: noreply@servicetitan.com`
block. Accepted narrowly, because a human chose to forward it, the recovered sender only raises a
confidence score, and contractors are always queued for confirmation and never auto-created. It must
not become an auto-apply path.

**Defence in depth on a public endpoint.** Svix-style signature (with a 5-minute replay window) says
the provider sent it; the token says which home consented to receive it. Neither alone is enough.
Unknown addresses log a warning and return the same 200 as everything else — an error that
distinguishes a real token from a fake one is an enumeration oracle. 120 messages/hour/home caps the
Claude spend if an address leaks.

## Verification

```bash
pnpm test:inbound          # 32 checks, pure, instant
pnpm test:inbound --live   # + end-to-end on a scratch home, one Haiku call
```

The live pass proves the thing the pure checks cannot: a forwarded ServiceTitan confirmation comes
out the far end as a queued Lebrun Electric card at >= 0.8, a replayed webhook is a no-op, and an
unknown address writes nothing.

## Known gaps

- **No UI feedback loop.** Forwarded mail appears in "What we read" in Settings, but nothing tells
  the user "we got it" at the moment they forward. A reply-back email would be the obvious next step
  and needs the outbound sender that is already configured.
- **Auto-forward confirmation codes** are skipped as non-service mail (above). If this becomes the
  main onboarding path, special-case them and surface the code in the UI.
- **`processing` rows** from a crashed inbound run are swept only by a Gmail sync, since
  `sweepStranded` runs at the top of `syncContractorEmail`. A home that only ever forwards never
  sweeps.
