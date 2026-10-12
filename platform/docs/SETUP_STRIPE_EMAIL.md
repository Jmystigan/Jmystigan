# Setting up payments (Stripe) and email (Resend)

Everything below is configured with environment variables. Nothing about cards touches this server — buyers pay on Stripe's hosted Checkout page.

## 1. Stripe (do this in **test mode** first)
1. Dashboard → **Product catalog → Add product**: "<Game name>", **one-time** price. Copy the **Price ID** (`price_…`) → `STRIPE_PRICE_ID`.
2. **Developers → API keys** → secret key (`sk_test_…`) → `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint**: `https://YOUR-DOMAIN/api/stripe/webhook`, events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
   Copy the **signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
4. Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (Stripe CLI prints a temporary `whsec_`), then buy with test card `4242 4242 4242 4242`.
5. Go live: repeat with live keys/endpoint. Turn on **receipts** (Settings → Customer emails) and set a clear **statement descriptor**.
6. Sales tax: register where required, enable Stripe Tax, then set `STRIPE_AUTOMATIC_TAX=1`.

### What happens
| Event | Result |
|---|---|
| Buyer pays | Webhook (or the thank-you page, whichever arrives first) creates **one** license keyed to the Checkout Session — safe against Stripe's retries — and emails the code + signup link to the buyer. |
| **Full refund** (dashboard or API) | License revoked, account **suspended**: existing sessions die, login says why, profile vanishes from the community. Data deleted automatically after `REFUND_RETENTION_DAYS` (90). |
| Partial refund | Ignored (a human decides). |
| Dispute opened | Revoked like a refund. **Dispute won** → reinstated. **Lost** → stays revoked. |
| Refund by mistake | Admin → licenses → **Reinstate**, or Admin → users → **Unban** (also restores the license). |

To refund: just refund in the Stripe dashboard. If you sell through another store/system too, call `DELETE /api/partner/codes/<externalId>` with `LAUNCHER_API_KEY`.

## 2. Email (Resend — free tier is plenty to start)
1. Create an account, **verify your sending domain** (adds SPF/DKIM DNS records), create an API key.
2. Set `RESEND_API_KEY`, `EMAIL_FROM="Your Studio <noreply@yourdomain.com>"`, `SUPPORT_EMAIL=help@yourdomain.com`.
3. Without these, emails are printed to the console and saved to `data/outbox.log` (dev only — nothing is sent).

Emails sent: parent approval request (under-13 signups), purchase code. Transactional only; no marketing.
Prefer Postmark/SES? Replace the body of `sendMail()` in `server/email.js` — it's the only place that talks to a provider.

## All env vars
`STUDIO_NAME GAME_NAME PUBLIC_URL PORT DATA_DIR JWT_SECRET ADMIN_USERNAME LAUNCHER_API_KEY LAUNCHER_URL HOST_BUILDS`
`STRIPE_SECRET_KEY STRIPE_PRICE_ID STRIPE_WEBHOOK_SECRET STRIPE_AUTOMATIC_TAX RESEND_API_KEY EMAIL_FROM SUPPORT_EMAIL`
`PENDING_CONSENT_DAYS (14) REFUND_RETENTION_DAYS (90) REGISTER_PER_HOUR (10)`

Back up `DATA_DIR` (it holds the database). Run behind HTTPS.
