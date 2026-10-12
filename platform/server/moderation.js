// Social safety for a kids' game. Defaults are strict; tune with your own policy / counsel.

// Under-13 players can only send these. Index is sent by the client.
export const PRESETS = [
  'Anyone skating here today?',
  'Great session!',
  'Want to try a trick challenge?',
  'Nice run!',
  'See you at the park!',
  'GG!',
  'Can someone show me a new trick?',
  'Good luck!',
];

// Placeholder blocklist: extend (ideally with a maintained profanity list / moderation API).
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'rape', 'kill yourself', 'kys'];

// Block anything that looks like personal info or off-platform contact.
const PII = [
  /\b\d{3}[\s.\-]?\d{3,4}[\s.\-]?\d{4}\b/,                // phone
  /[\w.+-]+@[\w-]+\.[\w.]+/,                              // email
  /(https?:\/\/|www\.|\.com\b|\.net\b|\.gg\b)/i,         // links
  /\b(snap(chat)?|insta(gram)?|discord|tiktok|kik|whatsapp|telegram)\b/i, // other platforms
  /\b(i live (at|on|in)|my address|my number)\b/i,
];

export function checkText(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, error: 'Message is empty' };
  if (text.length > 200) return { ok: false, error: 'Keep it under 200 characters' };
  const squashed = text.toLowerCase().replace(/[^a-z ]/g, '');
  if (BLOCKED.some((w) => squashed.includes(w))) return { ok: false, error: 'Please keep it friendly' };
  if (PII.some((r) => r.test(text))) return { ok: false, error: "Don't share personal info or contact details" };
  return { ok: true, text };
}
