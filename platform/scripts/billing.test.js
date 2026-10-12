import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skate-bill-'));
Object.assign(process.env, { DATA_DIR: dir, ADMIN_USERNAME: 'boss', REGISTER_PER_HOUR: '1000', STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_PRICE_ID: 'price_123', STRIPE_WEBHOOK_SECRET: 'whsec_test', LAUNCHER_API_KEY: 'partner-secret', PUBLIC_URL: 'https://app.test' });
const { app } = await import('../server/index.js');
const { setStripeClient } = await import('../server/stripe.js');
const { outbox } = await import('../server/email.js');
const { db } = await import('../server/db.js');

// Real Stripe signature verification; only the network calls (Checkout) are stubbed.
const real = new Stripe('sk_test_x');
const createArgs = [];
const sessions = { cs_late: { id: 'cs_late', payment_status: 'paid', customer_details: { email: 'late@example.com' }, payment_intent: 'pi_late' } };
setStripeClient({ webhooks: real.webhooks, checkout: { sessions: {
  create: async (a) => { createArgs.push(a); return { url: 'https://checkout.stripe.test/c/pay_1' }; },
  retrieve: async (id) => { if (!sessions[id]) throw new Error('no such session'); return sessions[id]; },
} } });

let server, base;
before(() => new Promise((ok) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}/api`; ok(); }); }));
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = async (method, url, body, token) => {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const hook = async (type, object, { secret = 'whsec_test' } = {}) => {
  const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), object: 'event', type, data: { object } });
  const header = real.webhooks.generateTestHeaderString({ payload, secret });
  const r = await fetch(`${base}/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
  return r.status;
};
const paidSession = (n, email = `buyer${n}@example.com`) => ({ id: `cs_${n}`, payment_status: 'paid', customer_details: { email }, payment_intent: `pi_${n}` });
const signup = (username, code) => call('POST', '/auth/register', { username, password: 'password123', birthYear: 1995, signupCode: code });
const codeFor = async (n) => (await call('GET', `/checkout/session/cs_${n}`)).body.code;

test('config advertises purchases; checkout creates a hosted session', async () => {
  assert.equal((await call('GET', '/config')).body.canBuy, true);
  const r = await call('POST', '/checkout', { email: 'me@example.com' });
  assert.equal(r.body.url, 'https://checkout.stripe.test/c/pay_1');
  const a = createArgs[0];
  assert.equal(a.mode, 'payment'); assert.equal(a.line_items[0].price, 'price_123');
  assert.equal(a.success_url, 'https://app.test/#/thanks?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(a.customer_email, 'me@example.com');
});

test('webhook: signature enforced; paid session -> one license + one email, replay-safe', async () => {
  assert.equal(await hook('checkout.session.completed', paidSession(1), { secret: 'whsec_wrong' }), 400);
  assert.equal((await call('GET', '/checkout/session/cs_1')).body.paid, false); // nothing created by the bad call
  assert.equal(await hook('checkout.session.completed', { ...paidSession(2), payment_status: 'unpaid' }), 200);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM licenses WHERE external_id = 'cs_2'").get().c, 0); // unpaid => no code
  assert.equal(await hook('checkout.session.completed', paidSession(1)), 200);
  assert.equal(await hook('checkout.session.completed', paidSession(1)), 200); // Stripe retries
  assert.equal(db.prepare("SELECT COUNT(*) c FROM licenses WHERE external_id = 'cs_1'").get().c, 1);
  const mails = outbox.filter((m) => m.to === 'buyer1@example.com');
  assert.equal(mails.length, 1);
  const code = (await call('GET', '/checkout/session/cs_1')).body.code;
  assert.match(mails[0].text, new RegExp(code)); assert.match(mails[0].text, /app\.test\/#\/register\?code=/);
});

test('thank-you page still works if the webhook is late (asks Stripe directly)', async () => {
  const r = (await call('GET', '/checkout/session/cs_late')).body;
  assert.equal(r.paid, true); assert.ok(r.code);
  assert.equal((await call('GET', '/checkout/session/cs_unknown')).body.paid, false);
  assert.equal((await call('GET', '/checkout/session/not-a-session')).status, 400);
});

test('purchased code -> signup -> full refund suspends access; partial refund does not', async () => {
  await hook('checkout.session.completed', paidSession(3));
  const code3 = await codeFor(3);
  const u = (await signup('refunded_rider', code3)).body;
  assert.ok(u.token);
  assert.equal((await call('GET', '/me', null, u.token)).status, 200);

  // partial refund: ignored
  await hook('charge.refunded', { id: 'ch_3', payment_intent: 'pi_3', amount: 5000, amount_refunded: 1000, refunded: false });
  assert.equal((await call('GET', '/me', null, u.token)).status, 200);

  // full refund: access ends
  await hook('charge.refunded', { id: 'ch_3', payment_intent: 'pi_3', amount: 5000, amount_refunded: 5000, refunded: true });
  assert.equal((await call('GET', '/me', null, u.token)).status, 401); // existing session dead
  const login = await call('POST', '/auth/login', { username: 'refunded_rider', password: 'password123' });
  assert.equal(login.status, 403); assert.match(login.body.error, /refunded/i);
  assert.equal((await call('GET', '/players/refunded_rider')).status, 404); // hidden from the community
  assert.equal((await call('GET', '/checkout/session/cs_3')).body.paid, false);

  // that code can't create another account
  assert.equal((await signup('second_try', code3)).status, 403);
});

test('dispute revokes; winning the dispute reinstates', async () => {
  await hook('checkout.session.completed', paidSession(4));
  const u = (await signup('disputed_rider', await codeFor(4))).body;
  await hook('charge.dispute.created', { id: 'dp_4', payment_intent: 'pi_4', status: 'needs_response' });
  assert.equal((await call('GET', '/me', null, u.token)).status, 401);
  await hook('charge.dispute.closed', { id: 'dp_4', payment_intent: 'pi_4', status: 'won' });
  assert.equal((await call('POST', '/auth/login', { username: 'disputed_rider', password: 'password123' })).status, 200);
  await hook('charge.dispute.created', { id: 'dp_4', payment_intent: 'pi_4', status: 'needs_response' });
  await hook('charge.dispute.closed', { id: 'dp_4', payment_intent: 'pi_4', status: 'lost' });
  assert.equal((await call('POST', '/auth/login', { username: 'disputed_rider', password: 'password123' })).status, 403);
});

test('partner revoke + admin revoke/reinstate/unban', async () => {
  const admin = (await call('POST', '/auth/register', { username: 'boss', password: 'password123', birthYear: 1990 })).body;
  const hdr = (m, p, key = 'partner-secret') => fetch(`${base}${p}`, { method: m, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: m === 'POST' ? JSON.stringify({ externalId: 'cust-9' }) : undefined });
  const code = (await (await hdr('POST', '/partner/codes')).json()).code;
  const u = (await signup('partner_rider', code)).body;
  assert.equal((await hdr('DELETE', '/partner/codes/cust-9', 'wrong')).status, 401);
  assert.equal((await (await hdr('DELETE', '/partner/codes/cust-9')).json()).revoked, 1);
  assert.equal((await call('GET', '/me', null, u.token)).status, 401);
  assert.equal((await hdr('POST', '/partner/codes')).status, 403); // revoked customer can't get a fresh code

  // admin can reverse it: unban restores the license too
  const id = db.prepare("SELECT id FROM users WHERE username = 'partner_rider'").get().id;
  assert.equal((await call('POST', `/admin/users/${id}`, { banned: false }, admin.token)).status, 200);
  assert.equal((await call('GET', '/me', null, u.token)).status, 200);
  assert.equal((await call('GET', '/library', null, u.token)).body.owned, true);
  // admin manual revoke by key
  assert.equal((await call('POST', `/admin/licenses/${code}/revoke`, { reason: 'test' }, admin.token)).status, 200);
  assert.equal((await call('GET', '/library', null, (await call('POST', '/auth/login', { username: 'boss', password: 'password123' })).body.token)).status, 200);
  assert.equal((await call('POST', `/admin/licenses/${code}/reinstate`, {}, admin.token)).status, 200);
});

test('suspended (refunded) accounts are deleted after the retention window', async () => {
  const { purgeSuspended } = await import('../server/jobs.js');
  await hook('checkout.session.completed', paidSession(7));
  await signup('soon_gone', await codeFor(7));
  await hook('charge.refunded', { id: 'ch_7', payment_intent: 'pi_7', amount: 100, amount_refunded: 100, refunded: true });
  assert.equal(purgeSuspended(), 0); // too recent: could still be reversed
  db.prepare("UPDATE licenses SET revoked_at = datetime('now','-91 days') WHERE payment_intent = 'pi_7'").run();
  assert.equal(purgeSuspended(), 1);
  assert.equal(db.prepare("SELECT 1 FROM users WHERE username = 'soon_gone'").get(), undefined);
});
