# Cubic Virtual Backend

Mock API for the Corporate Banking Payment Control Center assessment. Built on top of
`json-server`'s lowdb store, with hand-written Express routes so every response shape
and status code matches the assessment's API contract exactly (json-server's default
REST conventions aren't used directly).

## Running

```bash
npm install
npm run seed   # (re)generates db.json with 20,000 payments + reference data
npm start      # http://localhost:3000
```

`npm run dev` restarts on file changes (Node's `--watch`).

## Auth

There's no real login. The Angular app picks one of the demo users below and sends
its id on every request as `X-Demo-User`. A missing/unknown header is a
`401 UNAUTHENTICATED`.

`GET /api/demo-users` (not part of the official contract - a login-screen
convenience) lists the pickable users:

| userId | name | role | entitlements |
|---|---|---|---|
| `u-maker-1` | Fatima Al-Sabah | MAKER | PAYMENTS_CREATE |
| `u-maker-2` | Yousef Al-Rashidi | MAKER | PAYMENTS_CREATE, VIEW_FULL_ACCOUNT |
| `u-checker-1` | Noura Al-Fahad | CHECKER | PAYMENTS_DECIDE, VIEW_FULL_ACCOUNT |
| `u-checker-2` | Omar Al-Mutairi | CHECKER | PAYMENTS_DECIDE |
| `u-auditor-1` | Sara Boustani | AUDITOR | VIEW_FULL_ACCOUNT |

## Manual test scenarios seeded on purpose

| id | what it's for |
|---|---|
| `pmt-scn-checker-owns` | `makerUserId` is `u-checker-1` - proves a checker can't approve a payment they made themselves |
| `pmt-scn-draft` | stable Draft owned by `u-maker-1`, for edit/submit/cancel |
| `pmt-scn-international` | Pending Check, INTERNATIONAL, owned by `u-maker-1` |
| `pmt-scn-returned` | Returned, owned by `u-maker-1`, for the "edit a returned payment" flow |
| `pmt-scn-trigger-500` | any mutating call against it (submit/decision/edit) always returns `500 UNEXPECTED_ERROR` - deliberate hook for exercising the error UI on demand |

## Notable assumptions (the PDF contract has a couple of gaps)

- **Cancel Draft** (required by section 1.4) has no listed endpoint in section 2, so
  `POST /api/payments/:id/cancel` was added, mirroring `submit`'s request/response shape.
- **Bulk upload** columns (section 1.6) don't include a debit account or a
  DOMESTIC/INTERNATIONAL type. `POST /api/bulk-payments` expects a `debtorAccountId`
  form field alongside the CSV file (one account for the whole batch), and infers each
  row's type from whether `bankCodeOrSwift` matches a SWIFT/BIC pattern.
- FX quotes are validated server-side too (not just in the UI): `POST /api/payments`
  and `PUT /api/payments/:id` reject a missing/expired `fxQuoteId` with 422 when the
  debit account currency differs from the payment currency.
