import { Router } from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { rateLimit } from '../auth.js';
import { getStripe, stripeEnabled } from '../stripe.js';
import { mintCode, revokeLicense, reinstateLicense } from '../licenses.js';
import { sendMail, purchaseEmail } from '../email.js';

export const router = Router();

const signupUrl = (code) => `${config.publicUrl}/#/register?code=${code}`;

/** Create (idempotently, keyed by Checkout Session id) the license for a paid session and email the code once. */
export function fulfillSession(session) {
  if (!session || session.payment_status !== 'paid') return null;
  const existing = db.prepare('SELECT * FROM licenses WHERE external_id = ?').get(session.id);
  if (existing) return existing;
  const email = session.customer_details?.email || session.customer_email || null;
  const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
  const code = mintCode();
  db.prepare('INSERT INTO licenses (key, external_id, email, payment_intent, note) VALUES (?,?,?,?,?)').run(code, session.id, email, pi, 'stripe');
  if (email) {
    const m = purchaseEmail(code, signupUrl(code));
    sendMail({ to: email, ...m }).catch((e) => console.error('[email] purchase code failed:', e.message));
  }
  return db.prepare('SELECT * FROM licenses WHERE external_id = ?').get(session.id);
}

router.post('/checkout', rateLimit('checkout', 10, 3600_000, (r) => r.ip), async (req, res) => {
  if (!stripeEnabled()) return res.status(404).json({ error: 'Purchases are not open yet' });
  const email = String(req.body?.email ?? '').trim();
  const s = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: config.stripePriceId, quantity: 1 }],
    success_url: `${config.publicUrl}/#/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.publicUrl}/#/play`,
    ...(config.stripeAutomaticTax && { automatic_tax: { enabled: true } }),
    ...(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && { customer_email: email }),
  });
  res.json({ url: s.url });
});

// The thank-you page polls this. The session id is an unguessable value only the buyer's browser has.
router.get('/checkout/session/:id', rateLimit('cs', 60, 600_000, (r) => r.ip), async (req, res) => {
  const id = String(req.params.id);
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'Bad session' });
  let lic = db.prepare('SELECT * FROM licenses WHERE external_id = ?').get(id);
  if (!lic && stripeEnabled()) { // webhook may be a moment late: ask Stripe directly, fulfil idempotently
    try { lic = fulfillSession(await getStripe().checkout.sessions.retrieve(id)); } catch { /* unknown session */ }
  }
  if (!lic || lic.revoked_at) return res.json({ paid: false });
  res.json({ paid: true, code: lic.key, email: lic.email, signupUrl: signupUrl(lic.key), used: !!lic.user_id });
});

/** Raw-body handler (mounted in index.js before express.json). Always answers 2xx for verified events. */
export function webhook(req, res) {
  if (!config.stripeWebhookSecret) return res.status(404).end();
  let event;
  try { event = getStripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripeWebhookSecret); }
  catch { return res.status(400).json({ error: 'Bad signature' }); }
  const o = event.data.object;
  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        fulfillSession(o); break;
      case 'charge.refunded': // only a FULL refund ends access; partial refunds are left for a human to judge
        if (o.amount_refunded >= o.amount) console.log(`[stripe] full refund -> revoked ${revokeLicense('payment_intent', o.payment_intent, 'refunded')}`);
        break;
      case 'charge.dispute.created':
        console.log(`[stripe] dispute -> revoked ${revokeLicense('payment_intent', o.payment_intent, 'dispute')}`); break;
      case 'charge.dispute.closed':
        if (o.status === 'won') console.log(`[stripe] dispute won -> reinstated ${reinstateLicense('payment_intent', o.payment_intent)}`);
        else revokeLicense('payment_intent', o.payment_intent, 'dispute lost');
        break;
    }
  } catch (e) { console.error('[stripe] handler error', e); return res.status(500).end(); } // Stripe will retry
  res.json({ received: true });
}
