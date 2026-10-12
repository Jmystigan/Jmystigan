import Stripe from 'stripe';
import { config } from './config.js';

let client = null;
export const stripeEnabled = () => !!(config.stripeSecretKey && config.stripePriceId);
export const getStripe = () => (client ??= new Stripe(config.stripeSecretKey || 'sk_not_configured'));
export const setStripeClient = (c) => { client = c; }; // tests inject a stub
