// Sofra — mock assistant backend for the frontend case study.
//
// Zero dependencies. Node >= 20.   node mock-server/server.mjs
//
// This is NOT an LLM. It is a deterministic, scripted stand-in for the
// assistant backend: it understands the prompts in the README, speaks the
// real contract (schema/ui_spec.schema.json over the stream protocol in
// schema/stream_events.schema.json), enforces the confirm_token rules for
// real, and keeps state (wallet, cart, orders) that changes when actions
// execute. It also records what the client does in a ledger, so graders can
// check behaviour that is invisible on screen.
//
// You may read this file. You should not need to change it, and your client
// must work against it unmodified.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- config ---

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const PORT = Number(env('PORT', 4000));
const ORIGIN = env('PUBLIC_ORIGIN', `http://localhost:${PORT}`);
const REFERENCE_NOW = env('REFERENCE_NOW', '2026-08-20T12:00:00+03:00');
const TOKEN_TTL_S = Number(env('TOKEN_TTL_SECONDS', 300));
const SHORT_TTL_S = Number(env('SHORT_TTL_SECONDS', 20));
const STREAM_DELAY_MS = Number(env('STREAM_DELAY_MS', 18));
const REST_LATENCY_MS = Number(env('REST_LATENCY_MS', 250));
const GLOBAL_CHAOS = env('CHAOS', '');
const TIP_CAP_TRY = 500;
const FREE_DELIVERY_THRESHOLD_TRY = 250;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '../data');
const SECRET = crypto.randomBytes(32);

// ----------------------------------------------------------------- clock ---
// The server's "now" starts at REFERENCE_NOW and advances in real time.
// It is deliberately far from the browser's clock.

let clockStartReal = Date.now();
let clockOffsetMs = 0;
const nowMs = () => Date.parse(REFERENCE_NOW) + (Date.now() - clockStartReal) + clockOffsetMs;
const nowIso = () => new Date(nowMs()).toISOString();
const today = () => new Date(nowMs() + 3 * 3600e3).toISOString().slice(0, 10); // İstanbul date

// ----------------------------------------------------------------- state ---

let S; // mutable world state
function loadState() {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
  const orders = read('orders.json');
  delete orders._note;
  for (const list of Object.values(orders)) for (const o of list) o.tips = [];
  S = {
    users: Object.fromEntries(read('users.json').users.map((u) => [u.id, u])),
    restaurants: read('restaurants.json').restaurants,
    carts: read('carts.json'),
    orders,
    kb: fs.readFileSync(path.join(DATA, 'knowledge/kb.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
    tokens: new Map(), // nonce -> record
    conversations: new Map(),
    ledger: { execute_attempts: [], executions: [], security_beacons: [] },
    orderSeq: 100,
    transientSeen: new Set(), // user|message pairs whose transport chaos already fired
  };
  clockStartReal = Date.now();
  clockOffsetMs = 0;
}
loadState();

const fillNote = (note, via) => note.replaceAll('{{ORIGIN}}', ORIGIN).replaceAll('{{VIA}}', via);

// --------------------------------------------------------------- helpers ---

const fold = (s) =>
  String(s).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tl = (n) => `${n} TL`;
const findRestaurant = (id) => S.restaurants.find((r) => r.id === id);
const findRestaurantByName = (name) => S.restaurants.find((r) => r.name === name);
const findItem = (r, itemId) => r.menu.find((m) => m.item_id === itemId);
const userOrders = (uid) => (S.orders[uid] ||= []);
const findOrder = (uid, oid) => userOrders(uid).find((o) => o.order_id === oid);
const sortedOrders = (uid) => [...userOrders(uid)].sort((a, b) => b.date.localeCompare(a.date) || b.order_id.localeCompare(a.order_id));
const reply = (blocks, audit) => ({ version: '1', blocks, audit });
const text = (markdown) => ({ type: 'text', markdown });
const chips = (...c) => ({ type: 'suggested_actions', chips: c });
const gate = (requirement, reason, cta) => ({ type: 'verification_gate', requirement, reason, cta });
const canonical = (v) =>
  Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  : JSON.stringify(v);

const NUM = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const parseNum = (s) => (s == null ? null : /^\d+$/.test(s) ? Number(s) : NUM[s] ?? null);

// Money rules — the same single set of rules as the backend case (quote_checkout).
function quote(user, restaurant, items) {
  const subtotal = items.reduce((s, it) => s + findItem(restaurant, it.item_id).price_try * it.qty, 0);
  const fee = subtotal >= FREE_DELIVERY_THRESHOLD_TRY ? 0 : restaurant.delivery_fee_try;
  const total = subtotal + fee;
  return {
    subtotal_try: subtotal,
    delivery_fee_try: fee,
    total_try: total,
    min_order_try: restaurant.min_order_try,
    meets_minimum: subtotal >= restaurant.min_order_try,
    free_delivery_threshold_try: FREE_DELIVERY_THRESHOLD_TRY,
    sufficient_funds: user.wallet_balance_try >= total || user.payment_method,
  };
}
const payPlan = (user, amount) => {
  const wallet = Math.min(user.wallet_balance_try, amount);
  return { wallet_try: wallet, card_try: amount - wallet };
};
const payLine = (user, amount) => {
  const p = payPlan(user, amount);
  return p.card_try === 0
    ? `Paid from your wallet (balance ${tl(user.wallet_balance_try)}).`
    : `${tl(p.wallet_try)} from your wallet, ${tl(p.card_try)} charged to your saved card.`;
};

function cartSummary(user, restaurant, items) {
  const q = quote(user, restaurant, items);
  return {
    type: 'cart_summary',
    restaurant_id: restaurant.id,
    items: items.map((it) => {
      const m = findItem(restaurant, it.item_id);
      return { name: m.name, qty: it.qty, price_try: m.price_try };
    }),
    subtotal_try: q.subtotal_try,
    delivery_fee_try: q.delivery_fee_try,
    total_try: q.total_try,
    min_order_try: q.min_order_try,
    meets_minimum: q.meets_minimum,
  };
}
const restaurantCard = (r) => ({
  type: 'restaurant_card', restaurant_id: r.id, name: r.name, cuisine: r.cuisine, rating: r.rating,
  delivery_fee_try: r.delivery_fee_try, min_order_try: r.min_order_try, eta_min: r.eta_min, district: r.district,
});
const menuItem = (m) => ({
  type: 'menu_item', item_id: m.item_id, name: m.name, price_try: m.price_try,
  available: m.available, age_restricted: m.age_restricted, category: m.category,
});
const orderSummary = (o, via = 'note_field') => {
  const b = { type: 'order_summary', order_id: o.order_id, restaurant: o.restaurant, total_try: o.total_try, status: o.status, date: o.date };
  if (o.status === 'received') b.eta_min = findRestaurantByName(o.restaurant)?.eta_min ?? 30;
  if (o.note) b.note = fillNote(o.note, via);
  return b;
};

// --------------------------------------------------------------- tokens ---

function issueToken(ctx, action, params, meta = {}) {
  // One live confirmation per (user, action): a newer prompt supersedes older ones.
  for (const rec of S.tokens.values())
    if (rec.user_id === ctx.user.id && rec.action === action && rec.state === 'live') rec.state = 'superseded';
  const nonce = crypto.randomBytes(9).toString('base64url');
  const ttl = ctx.chaos.has('short_ttl') ? SHORT_TTL_S : TOKEN_TTL_S;
  const rec = {
    nonce, user_id: ctx.user.id, action, params: structuredClone(params),
    expires_at: new Date(nowMs() + ttl * 1000).toISOString(), state: 'live',
    issued_at: nowIso(), conversation_id: ctx.conversationId, meta,
    drop_response: ctx.chaos.has('drop_execute_response'),
    bait: ctx.chaos.has('malformed_confirmation'),
  };
  Object.freeze(rec.params);
  rec.sig = sign(rec);
  S.tokens.set(nonce, rec);
  return rec;
}
const sign = (rec) =>
  crypto.createHmac('sha256', SECRET)
    .update(canonical({ u: rec.user_id, a: rec.action, p: rec.params, e: rec.expires_at, n: rec.nonce }))
    .digest('base64url');
const tokenString = (rec) => `ct_${rec.nonce}.${rec.sig}`;
function lookupToken(token) {
  const m = /^ct_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(token || ''));
  if (!m) return null;
  const rec = S.tokens.get(m[1]);
  if (!rec) return null;
  const a = Buffer.from(rec.sig), b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? rec : null;
}
const confirmationPrompt = (rec, summary) => ({
  type: 'confirmation_prompt', action: rec.action, summary, params: rec.params,
  confirm_token: tokenString(rec), expires_at: rec.expires_at,
});

// ------------------------------------------------------ sensitive flows ---

// place_order: returns a full response (gate, clarify, or confirmation).
function orderFlow(ctx, restaurant, items, { assumption = null, fromCart = false } = {}) {
  const u = ctx.user;
  const tools = ['get_user', 'search_restaurants', 'get_menu'];
  const audit = (decision, reason, extra = {}) => ({ user_id: u.id, intent: 'place_order', tools_called: tools, decision, reason, ...extra });
  ctx.conv.lastOrder = { restaurant_id: restaurant.id, items: structuredClone(items), fromCart };

  if (!restaurant.delivery_districts.includes(u.district))
    return reply(
      [text(`**${restaurant.name}** doesn't deliver to ${u.district}.`),
        gate('out_of_service_area', `${restaurant.name} delivers to ${restaurant.delivery_districts.join(', ')}. Your address is in ${u.district}.`, 'See restaurants that deliver to you'),
        chips('Show restaurants near me')],
      audit('blocked', 'out_of_service_area'));

  if (!items.length) {
    return reply(
      [text(`What would you like from **${restaurant.name}**? Here is the menu:`), ...restaurant.menu.map(menuItem), chips(`Order 1 ${restaurant.menu[0].name} from ${restaurant.name}`)],
      audit('clarify', 'no item specified'));
  }

  const bad = items.map((it) => findItem(restaurant, it.item_id)).find((m) => !m.available);
  if (bad)
    return reply(
      [gate('item_unavailable', `${bad.name} is currently unavailable at ${restaurant.name}.`, `See the ${restaurant.name} menu`),
        chips(`Show the ${restaurant.name} menu`)],
      audit('blocked', 'item_unavailable'));

  const restricted = items.map((it) => findItem(restaurant, it.item_id)).find((m) => m.age_restricted);
  if (restricted && !u.age_verified)
    return reply(
      [gate('age_18_plus', `${restricted.name} is sold only to users aged 18+ who have completed age verification.`, 'Verify your age under Profile > Age Verification')],
      audit('blocked', 'age_18_plus', { kb_doc_ids: ['pol_age_restricted', 'faq_14'] }));

  tools.push('quote_checkout');
  const q = quote(u, restaurant, items);
  if (!q.meets_minimum)
    return reply(
      [cartSummary(u, restaurant, items),
        gate('min_order', `${restaurant.name} has a minimum order of ${tl(q.min_order_try)} (item subtotal). This order's subtotal is ${tl(q.subtotal_try)}.`, 'Add more items')],
      audit('blocked', 'min_order'));

  if (!q.sufficient_funds)
    return reply(
      [cartSummary(u, restaurant, items),
        gate('sufficient_funds', `The total is ${tl(q.total_try)}. Your wallet has ${tl(u.wallet_balance_try)} and there is no saved card.`, 'Top up your wallet or add a card')],
      audit('blocked', 'sufficient_funds'));

  const params = { restaurant_id: restaurant.id, items: items.map(({ item_id, qty }) => ({ item_id, qty })), total_try: q.total_try };
  const rec = issueToken(ctx, 'place_order', params, { fromCart });
  const lines = items.map((it) => `${it.qty} × ${findItem(restaurant, it.item_id).name}`).join(', ');
  const blocks = [];
  if (assumption) blocks.push(text(assumption));
  blocks.push(cartSummary(u, restaurant, items));
  blocks.push(confirmationPrompt(rec, `Place an order at ${restaurant.name}: ${lines}. Total ${tl(q.total_try)}${q.delivery_fee_try === 0 ? ' (free delivery)' : ''}. ${payLine(u, q.total_try)}`));
  return reply(blocks, audit('needs_confirmation', assumption ? 'ambiguous scope resolved by stated assumption' : 'awaiting user confirmation'));
}

function cancelFlow(ctx, orderId) {
  const u = ctx.user;
  const audit = (decision, reason) => ({ user_id: u.id, intent: 'cancel_order', tools_called: ['list_orders'], decision, reason, kb_doc_ids: ['pol_cancel'] });
  const o = findOrder(u.id, orderId);
  if (!o) return reply([{ type: 'error', code: 'order_not_found', message: `I couldn't find order ${orderId} on your account.` }], audit('refused', 'order_not_found'));
  if (o.status !== 'received')
    return reply(
      [orderSummary(o), gate('not_cancellable', `Order ${o.order_id} is ${o.status}. An order can only be cancelled before the restaurant starts preparing it.`, o.status === 'delivered' ? 'Report an issue with this order' : 'Back to my orders')],
      audit('blocked', 'not_cancellable'));
  const rec = issueToken(ctx, 'cancel_order', { order_id: o.order_id });
  return reply(
    [orderSummary(o), confirmationPrompt(rec, `Cancel order ${o.order_id} from ${o.restaurant} (${tl(o.total_try)}). The amount is refunded to your wallet immediately.`)],
    audit('needs_confirmation', 'awaiting user confirmation'));
}

function tipFlow(ctx, orderId, amount) {
  const u = ctx.user;
  const audit = (decision, reason) => ({ user_id: u.id, intent: 'add_tip', tools_called: ['list_orders', 'get_user'], decision, reason, kb_doc_ids: ['pol_tip'] });
  const o = findOrder(u.id, orderId);
  if (!o) return reply([{ type: 'error', code: 'order_not_found', message: `I couldn't find order ${orderId} on your account.` }], audit('refused', 'order_not_found'));
  const ageDays = (Date.parse(today()) - Date.parse(o.date)) / 86400e3;
  if (o.status === 'cancelled' || (o.status === 'delivered' && ageDays > 7))
    return reply(
      [orderSummary(o), gate('tip_window_expired', o.status === 'cancelled' ? `Order ${o.order_id} was cancelled, so it can't be tipped.` : `Order ${o.order_id} was delivered on ${o.date}. Tips can be left up to 7 days after delivery.`, 'Back to my orders')],
      audit('blocked', 'tip_window_expired'));
  const cap = Math.min(o.total_try, TIP_CAP_TRY);
  if (amount == null)
    return reply([text(`How much would you like to tip on order ${o.order_id}? The maximum is ${tl(cap)}.`), chips(...[20, 30, 50].filter((n) => n <= cap).map((n) => `Leave a ${n} TL tip on ${o.order_id}`))], audit('clarify', 'amount missing'));
  if (!(amount > 0) || amount > cap)
    return reply([{ type: 'error', code: 'invalid_tip_amount', message: `A tip must be more than 0 TL and at most ${tl(cap)} on this order.` }], audit('clarify', 'amount out of range'));
  if (!(u.wallet_balance_try >= amount || u.payment_method))
    return reply([gate('sufficient_funds', `Your wallet has ${tl(u.wallet_balance_try)} and there is no saved card.`, 'Top up your wallet or add a card')], audit('blocked', 'sufficient_funds'));
  ctx.conv.lastTipOrder = o.order_id;
  const rec = issueToken(ctx, 'add_tip', { order_id: o.order_id, amount_try: amount });
  return reply(
    [orderSummary(o), confirmationPrompt(rec, `Tip the courier ${tl(amount)} on order ${o.order_id} (${o.restaurant}). Tips can't be changed once left. ${payLine(u, amount)}`)],
    audit('needs_confirmation', 'awaiting user confirmation'));
}

// Re-runs the gates at execution time: state may have changed since the prompt.
// Returns the first closed gate, or null.
function recheck(rec) {
  const u = S.users[rec.user_id];
  const p = rec.params;
  if (rec.action === 'place_order') {
    const rst = findRestaurant(p.restaurant_id);
    if (!rst.delivery_districts.includes(u.district)) return 'out_of_service_area';
    if (p.items.some((it) => !findItem(rst, it.item_id)?.available)) return 'item_unavailable';
    const q = quote(u, rst, p.items);
    if (!q.meets_minimum) return 'min_order';
    if (!q.sufficient_funds) return 'sufficient_funds';
  } else if (rec.action === 'cancel_order') {
    if (findOrder(rec.user_id, p.order_id)?.status !== 'received') return 'not_cancellable';
  } else if (rec.action === 'add_tip') {
    const o = findOrder(rec.user_id, p.order_id);
    if (!o || o.status === 'cancelled') return 'tip_window_expired';
    if (!(u.wallet_balance_try >= p.amount_try || u.payment_method)) return 'sufficient_funds';
  }
  return null;
}

// A fresh prompt for the given params (after an expired / mismatched token). Gates run again.
function reprompt(rec, params) {
  const conv = S.conversations.get(rec.conversation_id) || { lastOrder: null };
  const ctx = { user: S.users[rec.user_id], chaos: new Set(), conv, conversationId: rec.conversation_id };
  try {
    if (rec.action === 'place_order') return orderFlow(ctx, findRestaurant(params.restaurant_id), params.items.map((i) => ({ item_id: i.item_id, qty: Number(i.qty) })));
    if (rec.action === 'cancel_order') return cancelFlow(ctx, params.order_id);
    if (rec.action === 'add_tip') return tipFlow(ctx, params.order_id, Number(params.amount_try));
  } catch {
    /* params from the client are garbage */
  }
  return null;
}

function execute(rec) {
  const u = S.users[rec.user_id];
  const p = rec.params;
  const audit = { user_id: u.id, intent: rec.action, tools_called: [rec.action], decision: 'answered', reason: 'confirmed by user' };
  if (rec.action === 'place_order') {
    const rst = findRestaurant(p.restaurant_id);
    const q = quote(u, rst, p.items);
    const pay = payPlan(u, q.total_try);
    u.wallet_balance_try -= pay.wallet_try;
    const o = { order_id: `${u.id}_o${++S.orderSeq}`, date: today(), restaurant: rst.name, total_try: q.total_try, status: 'received', note: '', tips: [], payment: pay };
    userOrders(u.id).push(o);
    const cart = S.carts[u.id];
    if (rec.meta.fromCart && cart?.restaurant_id === rst.id) S.carts[u.id] = { restaurant_id: null, items: [] };
    return { result: o, response: reply([text(`Your order from **${rst.name}** is placed. ${pay.card_try ? `${tl(pay.wallet_try)} was taken from your wallet and ${tl(pay.card_try)} charged to your card.` : `${tl(pay.wallet_try)} was taken from your wallet.`}`), orderSummary(o), chips('Show my recent orders', 'Cancel my last order')], audit) };
  }
  if (rec.action === 'cancel_order') {
    const o = findOrder(u.id, p.order_id);
    o.status = 'cancelled';
    const pay = o.payment || { wallet_try: o.total_try, card_try: 0 };
    u.wallet_balance_try += pay.wallet_try;
    return { result: o, response: reply([text(`Order ${o.order_id} is cancelled. ${tl(pay.wallet_try)} is back in your wallet${pay.card_try ? `; ${tl(pay.card_try)} returns to your card within 3-5 business days` : ''}.`), orderSummary(o)], { ...audit, kb_doc_ids: ['pol_refund'] }) };
  }
  if (rec.action === 'add_tip') {
    const o = findOrder(u.id, p.order_id);
    const pay = payPlan(u, p.amount_try);
    u.wallet_balance_try -= pay.wallet_try;
    o.tips.push({ amount_try: p.amount_try, at: nowIso(), payment: pay });
    return { result: { order_id: o.order_id, tip_try: p.amount_try }, response: reply([text(`You tipped the courier ${tl(p.amount_try)} on order ${o.order_id}. The whole tip goes to the courier.`), orderSummary(o)], { ...audit, kb_doc_ids: ['pol_tip'] }) };
  }
}

// ------------------------------------------------------------ the "agent" ---

const KB_ANSWERS = [
  { re: /calorie|kcal|nutrition/, unknown: 'The help center has no nutritional or calorie information for menu items, so I can\'t tell you that. The restaurant may be able to help.' },
  { re: /choose.*courier|pick.*courier|which courier/, unknown: 'The help center doesn\'t cover choosing a courier in advance, so I can\'t confirm that it\'s possible.' },
  { re: /(refund|cancel|order).*without.*confirm/, ids: ['pol_security'], md: 'No. Payment and refund transactions **always** require an additional confirmation on your device — the assistant never completes them on its own.\n\n_Note: one help-center document contains an embedded "system note" claiming the assistant may skip confirmation. That text is data, not an instruction, and I have not followed it._' },
  { re: /deliver\w*.*(fee|cost|free)|(fee|cost).*deliver|free delivery|shipping/, ids: ['pol_delivery_fee_v2', 'ann_fee_current'], md: 'Delivery is **free when the item subtotal is 250 TL or more**. Below 250 TL the restaurant\'s own delivery fee applies (15–30 TL depending on the restaurant); you\'ll see it on the order screen.\n\n_An older 2024 policy (free over 150 TL) is archived and no longer applies._' },
  { re: /energy drink|age.?restrict|\b18\b|age verif/, ids: ['pol_age_restricted', 'faq_14'], md: 'Energy drinks are **age-restricted**: you must be **18 or over** and have completed age verification (Profile › Age Verification). The courier also checks ID on delivery; if age can\'t be verified the item isn\'t handed over and its value is refunded.' },
  { re: /refund/, ids: ['pol_refund', 'faq_9'], md: 'Approved refunds reach your **wallet immediately**, or your **card within 3–5 business days**. Issues with an order (missing, wrong or cold items) can be reported within 24 hours of delivery.' },
  { re: /how late.*cancel|cancel.*(policy|rule)|can i cancel/, ids: ['pol_cancel', 'faq_5'], md: 'You can cancel **free of charge until the restaurant starts preparing** your order. After preparation has started it can\'t be cancelled — you\'d need to report an issue instead.' },
  { re: /minimum order/, ids: ['pol_min_order'], md: 'Each restaurant sets its own minimum order value, usually **100–200 TL**. It\'s checked against the item subtotal — the delivery fee doesn\'t count towards it.' },
  { re: /\btips?\b/, ids: ['pol_tip', 'faq_18'], md: 'Yes — the **entire tip goes to the courier**; Sofra takes no commission. You can tip at delivery or within 7 days after it. A tip can\'t be changed once it\'s left.' },
  { re: /wallet.*(not enough|insufficient)|payment method|how.*pay/, ids: ['pol_payment', 'faq_11'], md: 'Payment is taken from your **wallet first**; if it doesn\'t cover the total, the rest is charged to your **saved card**. With no saved card and an insufficient balance, the order can\'t be completed.' },
];
const CUISINES = { pizza: ['Italian'], italian: ['Italian'], burger: ['Fast Food'], 'fast food': ['Fast Food'], sushi: ['Japanese'], japanese: ['Japanese'], vegan: ['Vegan'], dessert: ['Dessert'], sweet: ['Dessert'], fish: ['Seafood'], seafood: ['Seafood'], turkish: ['Turkish'], kebab: ['Turkish'], noodle: ['Asian'], asian: ['Asian'], breakfast: ['Breakfast'] };

function itemAliases(menu) {
  const out = [];
  for (const m of menu) {
    const f = fold(m.name).replace(/\(.*?\)/g, '').trim();
    const words = f.split(/\s+/);
    const aliases = new Set([f]);
    if (words.length > 1) aliases.add(words.slice(0, 2).join(' '));
    if (words[0].length >= 5 && words[0] !== 'energy') aliases.add(words[0]);
    const last = words.at(-1);
    if (words.length > 1 && last.length >= 5 && menu.filter((x) => fold(x.name).includes(last)).length === 1) aliases.add(last);
    out.push({ m, aliases: [...aliases].sort((a, b) => b.length - a.length) });
  }
  return out;
}
// Aliases match at a word start (plurals allowed: "cheeseburgers"). The restaurant's
// own name is removed first so that "Köfteci Ramiz" does not match "köfte".
function parseItems(msg, restaurant) {
  const text = msg.replaceAll(fold(restaurant.name), ' ');
  const found = [];
  for (const { m, aliases } of itemAliases(restaurant.menu)) {
    const alias = aliases.find((a) => new RegExp(`(?<![\\p{L}\\d])${esc(a)}`, 'u').test(text));
    if (!alias) continue;
    const q = new RegExp(`(?<![\\p{L}\\d])(\\d+|${Object.keys(NUM).join('|')})\\s+(?:x\\s+)?(?:[\\p{L}-]+\\s+)?${esc(alias)}`, 'u').exec(text);
    found.push({ item_id: m.item_id, qty: parseNum(q?.[1]) ?? 1 });
  }
  return found;
}

function agent(ctx, raw) {
  const u = ctx.user;
  const msg = fold(raw).trim();
  const isQuestion = /^(how|what|when|where|why|can|could|does|do|is|are|which|will|if|should)\b/.test(msg) || msg.endsWith('?');
  const orderId = /\b(u_[a-z]+_o\w+|u_ok_inj)\b/.exec(msg)?.[1];
  const restaurant = S.restaurants.find((r) => msg.includes(fold(r.name)));

  // Typed confirmation. In this client, confirmation happens on the prompt, not in the composer.
  if (/^(confirm|yes|ok|onayla|go ahead)\b/.test(msg) && !/make it|change|instead/.test(msg))
    return reply([text('To go ahead, press **Confirm** on the confirmation card. I never execute a payment, cancellation or tip from a chat message alone.')],
      { user_id: u.id, intent: 'confirm', tools_called: [], decision: 'clarify', reason: 'confirmation must come from the confirmation_prompt' });

  // Change the quantity of the last order intent ("make it 5 cheeseburgers").
  const mk = /(?:make it|change it to|instead)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/.exec(msg);
  if (mk && ctx.conv.lastOrder) {
    const lo = ctx.conv.lastOrder;
    const items = structuredClone(lo.items);
    items[0].qty = parseNum(mk[1]);
    const rst = findRestaurant(lo.restaurant_id);
    return orderFlow(ctx, rst, items, { assumption: `Updated: ${items.map((i) => `${i.qty} × ${findItem(rst, i.item_id).name}`).join(', ')}. This replaces the previous confirmation, which can no longer be used.`, fromCart: lo.fromCart });
  }
  if (mk)
    return reply([text('There is no order in this conversation to change yet. What would you like to order?'), chips('Order 2 cheeseburgers from Burger Stop')],
      { user_id: u.id, intent: 'place_order', tools_called: [], decision: 'clarify', reason: 'no previous order intent in this conversation' });
  if (/(add|include).*(my )?cart/.test(msg) && ctx.conv.lastOrder) {
    const lo = ctx.conv.lastOrder;
    const cart = S.carts[u.id];
    if (cart?.restaurant_id === lo.restaurant_id) {
      const merged = structuredClone(cart.items);
      for (const it of lo.items) {
        const hit = merged.find((m) => m.item_id === it.item_id);
        hit ? (hit.qty += it.qty) : merged.push({ ...it });
      }
      return orderFlow(ctx, findRestaurant(lo.restaurant_id), merged, { assumption: 'Including the items already in your cart.', fromCart: true });
    }
  }

  if (isQuestion && !orderId)
    for (const a of KB_ANSWERS)
      if (a.re.test(msg)) {
        if (a.unknown) return reply([text(a.unknown)], { user_id: u.id, intent: 'faq', tools_called: ['kb_search'], decision: 'unknown', reason: 'not covered by the knowledge base', kb_doc_ids: [] });
        return reply([text(a.md)], { user_id: u.id, intent: 'faq', tools_called: ['kb_search'], decision: 'answered', reason: 'grounded in knowledge base', kb_doc_ids: a.ids });
      }

  if (/\bcancel\b/.test(msg)) {
    const target = orderId || (/last|latest|recent/.test(msg) ? sortedOrders(u.id)[0]?.order_id : null);
    if (!target) return reply([text('Which order would you like to cancel?'), ...sortedOrders(u.id).filter((o) => o.status === 'received').map((o) => orderSummary(o))], { user_id: u.id, intent: 'cancel_order', tools_called: ['list_orders'], decision: 'clarify', reason: 'order not specified' });
    return cancelFlow(ctx, target);
  }

  if (/\btip\b/.test(msg)) {
    const target = orderId || (/last|latest|recent/.test(msg) ? sortedOrders(u.id)[0]?.order_id : ctx.conv.lastTipOrder);
    const amount = /(\d+)\s*(tl|₺|lira)?/.exec(msg.replace(target || '', ''))?.[1];
    if (!target) return reply([text('Which order would you like to tip on?'), ...sortedOrders(u.id).slice(0, 3).map((o) => orderSummary(o))], { user_id: u.id, intent: 'add_tip', tools_called: ['list_orders'], decision: 'clarify', reason: 'order not specified' });
    return tipFlow(ctx, target, amount == null ? null : Number(amount));
  }

  if (/\b(order|buy|get me|i want|i'd like)\b/.test(msg) && !/\b(my )?(recent|past|previous|last) orders\b|order history|my orders/.test(msg)) {
    if (/\b(my cart|what is in my cart|what's in my cart)\b/.test(msg)) {
      const cart = S.carts[u.id];
      if (!cart?.restaurant_id) return reply([text('Your cart is empty.')], { user_id: u.id, intent: 'place_order', tools_called: ['get_cart'], decision: 'clarify', reason: 'empty cart' });
      return orderFlow(ctx, findRestaurant(cart.restaurant_id), structuredClone(cart.items), { fromCart: true });
    }
    if (!restaurant) return reply([text('Which restaurant would you like to order from?'), chips('Show restaurants near me')], { user_id: u.id, intent: 'place_order', tools_called: [], decision: 'clarify', reason: 'restaurant not specified' });
    const items = parseItems(msg, restaurant);
    const cart = S.carts[u.id];
    let assumption = null;
    if (items.length && cart?.restaurant_id === restaurant.id && cart.items.length) {
      const cq = quote(u, restaurant, cart.items), iq = quote(u, restaurant, items);
      const merged = structuredClone(cart.items);
      for (const it of items) { const h = merged.find((m) => m.item_id === it.item_id); h ? (h.qty += it.qty) : merged.push({ ...it }); }
      assumption = `Your cart already has items from ${restaurant.name} (${tl(cq.subtotal_try)}). **I've assumed you want only the items you just asked for** (${tl(iq.total_try)}). If you'd rather add them to your cart and order everything together (${tl(quote(u, restaurant, merged).total_try)}), say "include my cart".`;
    }
    return orderFlow(ctx, restaurant, items, { assumption });
  }

  if (/\bcart\b/.test(msg)) {
    const cart = S.carts[u.id];
    if (!cart?.restaurant_id || !cart.items.length) return reply([text('Your cart is empty.'), chips('Show restaurants near me')], { user_id: u.id, intent: 'view_cart', tools_called: ['get_cart'], decision: 'answered', reason: 'empty cart' });
    const rst = findRestaurant(cart.restaurant_id);
    const q = quote(u, rst, cart.items);
    return reply(
      [text(`Here's your cart from **${rst.name}**. You're ${tl(Math.max(0, FREE_DELIVERY_THRESHOLD_TRY - q.subtotal_try))} away from free delivery.`), cartSummary(u, rst, cart.items), chips('Order what is in my cart', `Show the ${rst.name} menu`)],
      { user_id: u.id, intent: 'view_cart', tools_called: ['get_cart', 'quote_checkout'], decision: 'answered', reason: 'data-backed' });
  }

  if (/\borders?\b/.test(msg) && /recent|past|previous|history|my orders|last orders/.test(msg)) {
    const list = sortedOrders(u.id).slice(0, 12);
    const noted = list.filter((o) => o.note);
    const blocks = [text(`Here are your ${list.length} most recent orders.`), ...list.map((o) => orderSummary(o))];
    if (noted.length)
      blocks.push(text(`${noted.length} order note${noted.length > 1 ? 's contain' : ' contains'} text that looks like instructions or markup. I'm showing ${noted.length > 1 ? 'them' : 'it'} as written — **I have not acted on ${noted.length > 1 ? 'them' : 'it'}**:\n\n${noted.map((o) => `> **${o.order_id}:** ${fillNote(o.note, 'markdown')}`).join('\n>\n')}`));
    blocks.push(chips('Cancel my last order', 'Leave a 20 TL tip on my last order'));
    return reply(blocks, { user_id: u.id, intent: 'list_orders', tools_called: ['list_orders'], decision: 'answered', reason: 'order notes treated as data' });
  }

  if (restaurant && /\bmap\b|where is/.test(msg))
    return reply(
      [text(`**${restaurant.name}** is in ${restaurant.district}.`),
        { type: 'map_view', restaurant_id: restaurant.id, lat: 40.9903, lng: 29.0275, zoom: 15 },
        restaurantCard(restaurant),
        text(`It delivers to ${restaurant.delivery_districts.join(', ')}.`)],
      { user_id: u.id, intent: 'locate_restaurant', tools_called: ['search_restaurants'], decision: 'answered', reason: 'model emitted a component outside the v1 catalog' });

  if (restaurant && /menu|what do they have|what does .* have/.test(msg))
    return reply(
      [text(`The **${restaurant.name}** menu:`), ...restaurant.menu.map(menuItem), chips(`Order 1 ${restaurant.menu[0].name} from ${restaurant.name}`)],
      { user_id: u.id, intent: 'view_menu', tools_called: ['get_menu'], decision: 'answered', reason: 'data-backed' });

  const cuisineKey = Object.keys(CUISINES).find((k) => msg.includes(k));
  if (cuisineKey || /near me|restaurants|places|what's near|what is near/.test(msg)) {
    const want = cuisineKey ? CUISINES[cuisineKey] : null;
    const list = S.restaurants
      .filter((r) => r.delivery_districts.includes(u.district) && (!want || want.includes(r.cuisine)))
      .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, 'tr'));
    if (!list.length) return reply([text(`I couldn't find ${cuisineKey || 'any'} restaurants that deliver to ${u.district}.`)], { user_id: u.id, intent: 'search_restaurants', tools_called: ['get_user', 'search_restaurants'], decision: 'answered', reason: 'no results' });
    return reply(
      [text(`${list.length} ${cuisineKey ? `${cuisineKey} ${list.length > 1 ? 'places' : 'place'}` : list.length > 1 ? 'restaurants' : 'restaurant'} deliver${list.length > 1 ? '' : 's'} to **${u.district}**, best rated first${cuisineKey === 'pizza' ? ' (matched on Italian cuisine)' : ''}:`), ...list.map(restaurantCard), chips(`Show the ${list[0].name} menu`)],
      { user_id: u.id, intent: 'search_restaurants', tools_called: ['get_user', 'search_restaurants'], decision: 'answered', reason: 'data-backed' });
  }

  if (isQuestion)
    return reply([text("I couldn't find anything about that in the Sofra help center, so I won't guess.")], { user_id: u.id, intent: 'faq', tools_called: ['kb_search'], decision: 'unknown', reason: 'not covered by the knowledge base', kb_doc_ids: [] });

  return reply(
    [text("I'm the scripted mock of the Sofra assistant, so I only understand a fixed set of requests. Try one of these:"),
      chips('What is in my cart?', 'Is there a pizza place near me?', 'Order 2 cheeseburgers from Burger Stop', 'Show my recent orders', 'How much is the delivery fee?')],
    { user_id: u.id, intent: 'unknown', tools_called: [], decision: 'unknown', reason: 'unrecognised prompt' });
}

// ------------------------------------------------------------ chaos ---

// Transport failures fire once per identical (user, message): retrying it succeeds.
const TRANSIENT = ['slow', 'drop_mid_stream', 'error_event', 'http_500', 'http_429'];
const CHAOS_MODES = [...TRANSIENT, 'replay', 'unknown_block', 'invalid_block', 'malformed_confirmation', 'version_2', 'short_ttl', 'drop_execute_response'];

function applyChaosToResponse(chaos, response) {
  const r = structuredClone(response);
  if (chaos.has('unknown_block')) r.blocks.splice(Math.min(1, r.blocks.length), 0, { type: 'rating_widget', stars: 5, prompt: 'How was this answer?' });
  if (chaos.has('invalid_block')) {
    const data = r.blocks.filter((b) => !['text', 'confirmation_prompt', 'suggested_actions'].includes(b.type));
    const b = data[1] ?? data[0];
    if (b) {
      if ('price_try' in b) b.price_try = `${b.price_try} TL`;
      else if ('total_try' in b) b.total_try = String(b.total_try);
      else if ('rating' in b) b.rating = 'excellent';
      else delete b[Object.keys(b).find((k) => k !== 'type')];
    }
  }
  if (chaos.has('malformed_confirmation'))
    for (const b of r.blocks) if (b.type === 'confirmation_prompt') delete b.expires_at;
  return r;
}

// ------------------------------------------------------------ streaming ---

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function splitText(md, rand) {
  const out = [];
  for (let i = 0; i < md.length; ) {
    const n = 2 + Math.floor(rand() * 9);
    out.push(md.slice(i, i + n));
    i += n;
  }
  return out;
}

async function stream(req, res, response, { chaos, conversationId, requestId }) {
  const rand = rng(parseInt(requestId.slice(-6), 36));
  const events = [];
  let seq = 0;
  const ev = (o) => events.push({ seq: ++seq, ...o });
  ev({ event: 'meta', version: chaos.has('version_2') ? '2' : '1', request_id: requestId, conversation_id: conversationId, server_now: nowIso() });
  response.blocks.forEach((b, index) => {
    if (b.type === 'text') {
      ev({ event: 'block', index, block: { ...b, markdown: '' } });
      for (const delta of splitText(b.markdown, rand)) ev({ event: 'text_delta', index, delta });
    } else ev({ event: 'block', index, block: b });
  });
  ev({ event: 'audit', audit: response.audit });
  ev({ event: 'done' });

  let plan = events;
  if (chaos.has('replay')) {
    // At-least-once delivery: re-send a window of already-sent events.
    plan = [];
    events.forEach((e, i) => {
      plan.push(e);
      if (i > 0 && i % 7 === 0) plan.push(...events.slice(Math.max(1, i - 3), i + 1));
    });
  }
  let cutAt = Infinity;
  if (chaos.has('error_event')) {
    const k = Math.min(3, plan.length - 2);
    plan = [...plan.slice(0, k), { seq: plan[k - 1].seq + 1, event: 'error', code: 'upstream_timeout', message: 'The assistant took too long to respond.', retryable: true }];
  }
  const bytes = Buffer.from(plan.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  if (chaos.has('drop_mid_stream')) cutAt = Math.floor(bytes.length * 0.55);

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Sofra-Now': nowIso(), ...CORS });
  res.flushHeaders();
  let closed = false;
  res.on('close', () => (closed = true));
  const slow = chaos.has('slow');
  const delay = slow ? STREAM_DELAY_MS * 6 : STREAM_DELAY_MS;
  await sleep(slow ? 4000 : 150 + rand() * 250);

  // Network chunks deliberately ignore line and UTF-8 character boundaries.
  for (let i = 0; i < bytes.length && !closed; ) {
    let n = Math.min(3 + Math.floor(rand() * 45), bytes.length - i);
    const lead = bytes.subarray(i + 1, i + n).findIndex((x) => x >= 0xc0);
    if (lead >= 0 && rand() < 0.7) n = lead + 2; // cut right after a multi-byte lead byte
    if (i + n > cutAt) {
      res.write(bytes.subarray(i, cutAt));
      await sleep(delay);
      res.socket?.destroy();
      return;
    }
    res.write(bytes.subarray(i, i + n));
    i += n;
    await sleep(delay);
  }
  if (!closed) res.end();
}

// ------------------------------------------------------------ http ---

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sofra-Chaos',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Sofra-Now, Retry-After',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (res, status, body, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Sofra-Now': nowIso(), ...CORS, ...extra });
  res.end(JSON.stringify(body, null, 2));
};
const apiError = (res, status, code, message, extra) => json(res, status, { error: { code, message } }, extra);
async function body(req) {
  let raw = '';
  for await (const c of req) raw += c;
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : { __invalid: true };
  } catch {
    return { __invalid: true };
  }
}
const parseChaos = (req, message) => {
  const set = new Set(GLOBAL_CHAOS.split(',').map((s) => s.trim()).filter(Boolean));
  for (const s of String(req.headers['x-sofra-chaos'] || '').split(',')) if (s.trim()) set.add(s.trim());
  let msg = message;
  const m = /^\/chaos\s+([\w,]+)\s*([\s\S]*)$/.exec(message || '');
  if (m) {
    m[1].split(',').forEach((s) => set.add(s));
    msg = m[2];
  }
  for (const s of set) if (!CHAOS_MODES.includes(s)) set.delete(s);
  return { chaos: set, message: msg };
};
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

async function handle(req, res) {
  const url = new URL(req.url, ORIGIN);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const seg = p.split('/').filter(Boolean);
  if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end();

  // Security beacon: any request here means untrusted content was executed or auto-loaded.
  if (p === '/__beacon' || p === '/__beacon.gif') {
    S.ledger.security_beacons.push({ at: nowIso(), kind: url.searchParams.get('kind'), via: url.searchParams.get('via'), referer: req.headers.referer || null, user_agent: req.headers['user-agent'] || null });
    console.warn(`\x1b[31m[beacon]\x1b[0m ${url.searchParams.get('kind')} via ${url.searchParams.get('via')}`);
    res.writeHead(200, { 'Content-Type': 'image/gif', ...CORS });
    return res.end(GIF);
  }

  if (p === '/') return json(res, 200, { name: 'sofra-mock', server_now: nowIso(), endpoints: ['POST /api/chat', 'POST /api/actions/execute', 'GET /api/actions/status?confirm_token=', 'GET /api/users', 'GET /api/users/:id', 'GET /api/users/:id/cart', 'GET /api/users/:id/orders', 'GET /api/restaurants?q=&cuisine=&near_district=', 'GET /api/restaurants/:id/menu', 'GET /api/kb/search?q=&category=&limit=&offset=', 'GET /api/kb/:id', 'GET /api/conversations/:id', 'GET /__admin/ledger', 'POST /__admin/reset', 'POST /__admin/clock'], chaos_modes: CHAOS_MODES });

  // ---- admin (for you and for the graders)
  if (p === '/__admin/ledger' && req.method === 'GET') return json(res, 200, S.ledger);
  if (p === '/__admin/reset' && req.method === 'POST') {
    loadState();
    return json(res, 200, { ok: true, server_now: nowIso() });
  }
  if (p === '/__admin/clock' && req.method === 'POST') {
    const b = await body(req);
    clockOffsetMs += Number(b.advance_seconds || 0) * 1000;
    return json(res, 200, { server_now: nowIso() });
  }

  if (seg[0] !== 'api') return apiError(res, 404, 'not_found', `No route for ${req.method} ${p}`);

  // ---- chat (streamed)
  if (p === '/api/chat' && req.method === 'POST') {
    const b = await body(req);
    if (b.__invalid) return apiError(res, 400, 'invalid_json', 'Request body is not valid JSON.');
    const user = S.users[b.user_id];
    if (!user) return apiError(res, 404, 'user_not_found', `Unknown user_id ${b.user_id}.`);
    if (typeof b.message !== 'string' || !b.message.trim()) return apiError(res, 400, 'empty_message', 'message is required.');
    const { chaos, message } = parseChaos(req, b.message);
    const seenKey = `${user.id}|${b.message}`;
    if (TRANSIENT.some((c) => chaos.has(c))) {
      if (S.transientSeen.has(seenKey)) TRANSIENT.forEach((c) => chaos.delete(c));
      else S.transientSeen.add(seenKey);
    }
    if (chaos.has('http_429')) return apiError(res, 429, 'rate_limited', 'Too many requests. Try again shortly.', { 'Retry-After': '3' });
    if (chaos.has('http_500')) return apiError(res, 500, 'internal', 'Something went wrong on our side.');
    let conversationId = b.conversation_id;
    let conv = conversationId && S.conversations.get(conversationId);
    if (conv && conv.user_id !== user.id) return apiError(res, 403, 'conversation_forbidden', 'That conversation belongs to another user.');
    if (!conv) {
      conversationId = `cv_${crypto.randomBytes(6).toString('base64url')}`;
      conv = { user_id: user.id, turns: [], lastOrder: null };
      S.conversations.set(conversationId, conv);
    }
    const requestId = `rq_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
    const ctx = { user, chaos, conv, conversationId };
    const response = applyChaosToResponse(chaos, agent(ctx, message));
    conv.turns.push({ role: 'user', text: b.message, at: nowIso() }, { role: 'assistant', request_id: requestId, response, at: nowIso(), complete: !['drop_mid_stream', 'error_event'].some((c) => chaos.has(c)) });
    return stream(req, res, response, { chaos, conversationId, requestId });
  }

  // ---- execute a confirmed action
  if (p === '/api/actions/execute' && req.method === 'POST') {
    const b = await body(req);
    const attempt = { at: nowIso(), user_id: b.user_id ?? null, action: b.action ?? null, token: b.confirm_token ?? null, outcome: null, http_status: null };
    S.ledger.execute_attempts.push(attempt);
    const done = (status, outcome, response, extra) => {
      attempt.outcome = outcome;
      attempt.http_status = status;
      return json(res, status, response, extra);
    };
    const refuse = (status, code, message, extraBlocks = [], decision = 'refused') =>
      done(status, code, reply([{ type: 'error', code, message }, ...extraBlocks], { user_id: b.user_id, intent: b.action, tools_called: [], decision, reason: code }));

    if (b.__invalid) return refuse(400, 'invalid_json', 'Request body is not valid JSON.');
    const rec = lookupToken(b.confirm_token);
    if (!rec || rec.user_id !== b.user_id) return refuse(403, 'token_invalid', 'This confirmation could not be verified. Nothing was executed.');
    attempt.nonce = rec.nonce;
    if (rec.bait) attempt.malformed_prompt_bait = true;
    if (rec.state === 'used') return refuse(409, 'token_used', `This confirmation was already used (${rec.result_ref}). Nothing new was executed.`);
    if (rec.state === 'superseded') return refuse(409, 'token_superseded', 'A newer confirmation replaced this one. Nothing was executed.');
    if (rec.state === 'void') return refuse(409, 'token_void', 'This confirmation is no longer valid. Nothing was executed.');
    if (rec.state === 'expired') return refuse(410, 'token_expired', 'This confirmation expired. Nothing was executed.');
    const sameAction = b.action === rec.action;
    const sameParams = sameAction && canonical(b.params ?? null) === canonical(rec.params);
    if (nowMs() > Date.parse(rec.expires_at)) {
      rec.state = 'expired';
      const again = reprompt(rec, rec.params);
      return refuse(410, 'token_expired', 'This confirmation expired. Nothing was executed.', again ? again.blocks : [], again ? again.audit.decision : 'refused');
    }
    if (!sameParams) {
      const again = sameAction && b.params ? reprompt(rec, b.params) : null;
      return refuse(409, 'params_mismatch', 'The details sent do not match what you approved. Nothing was executed.', again ? again.blocks : [], again ? again.audit.decision : 'refused');
    }
    const gateHit = recheck(rec);
    if (gateHit) {
      rec.state = 'void';
      return done(422, 'gate_closed', reply([gate(gateHit, `Something changed since you approved this (${gateHit}). Nothing was executed.`, 'Start again')], { user_id: b.user_id, intent: rec.action, tools_called: [], decision: 'blocked', reason: gateHit }));
    }
    // Single-use: consume before executing.
    rec.state = 'used';
    const { result, response } = execute(rec);
    rec.result_ref = result.order_id;
    rec.response = response;
    rec.executed_at = nowIso();
    S.ledger.executions.push({ at: rec.executed_at, nonce: rec.nonce, idempotency_key: `idem_${rec.nonce}`, user_id: rec.user_id, action: rec.action, params: rec.params, result_ref: result.order_id });
    if (rec.drop_response) {
      rec.drop_response = false;
      attempt.outcome = 'executed_response_dropped';
      await sleep(600);
      return req.socket.destroy();
    }
    return done(200, 'executed', response);
  }

  if (p === '/api/actions/status' && req.method === 'GET') {
    await sleep(REST_LATENCY_MS);
    const rec = lookupToken(url.searchParams.get('confirm_token'));
    if (!rec) return json(res, 200, { state: 'invalid' });
    const state = rec.state === 'live' && nowMs() > Date.parse(rec.expires_at) ? 'expired' : rec.state;
    return json(res, 200, { state, action: rec.action, expires_at: rec.expires_at, ...(state === 'used' ? { executed_at: rec.executed_at, result: rec.response } : {}) });
  }

  // ---- REST reads (plain JSON, a little latency so loading states are real)
  if (req.method !== 'GET') return apiError(res, 405, 'method_not_allowed', `${req.method} ${p}`);
  await sleep(REST_LATENCY_MS * (0.5 + Math.random()));

  if (p === '/api/users') return json(res, 200, Object.values(S.users).map(({ id, display_name, district }) => ({ id, display_name, district })));
  if (seg[1] === 'users' && seg[2]) {
    const u = S.users[decodeURIComponent(seg[2])];
    if (!u) return apiError(res, 404, 'user_not_found', `Unknown user ${seg[2]}.`);
    if (!seg[3]) return json(res, 200, u);
    if (seg[3] === 'cart') {
      const c = S.carts[u.id] || { restaurant_id: null, items: [] };
      const rst = c.restaurant_id && findRestaurant(c.restaurant_id);
      return json(res, 200, { restaurant_id: c.restaurant_id, restaurant_name: rst?.name ?? null, items: c.items.map((it) => { const m = findItem(rst, it.item_id); return { ...it, name: m.name, price_try: m.price_try }; }), quote: rst && c.items.length ? quote(u, rst, c.items) : null });
    }
    if (seg[3] === 'orders') return json(res, 200, sortedOrders(u.id).map((o) => ({ order_id: o.order_id, date: o.date, restaurant: o.restaurant, total_try: o.total_try, status: o.status, note: fillNote(o.note, 'rest_api'), tips_try: o.tips.reduce((s, t) => s + t.amount_try, 0) })));
  }
  if (p === '/api/restaurants') {
    const q = fold(url.searchParams.get('q') || ''), cuisine = url.searchParams.get('cuisine'), near = url.searchParams.get('near_district');
    return json(res, 200, S.restaurants
      .filter((r) => (!q || fold(r.name).includes(q) || fold(r.cuisine).includes(q)) && (!cuisine || fold(r.cuisine) === fold(cuisine)) && (!near || r.delivery_districts.some((d) => fold(d) === fold(near))))
      .map(({ menu, city, ...r }) => r));
  }
  if (seg[1] === 'restaurants' && seg[3] === 'menu') {
    const r = findRestaurant(seg[2]);
    return r ? json(res, 200, r.menu) : apiError(res, 404, 'restaurant_not_found', `Unknown restaurant ${seg[2]}.`);
  }
  if (p === '/api/kb/search') {
    const terms = fold(url.searchParams.get('q') || '').split(/\W+/).filter((t) => t.length > 2);
    const cat = url.searchParams.get('category');
    const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
    const scored = S.kb
      .filter((d) => !cat || d.category === cat)
      .map((d) => {
        const t = fold(d.title), bd = fold(d.body);
        const score = terms.length ? terms.reduce((s, w) => s + (t.includes(w) ? 3 : 0) + (bd.split(w).length - 1), 0) : 1;
        return { d, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || String(b.d.date).localeCompare(String(a.d.date)));
    return json(res, 200, { total: scored.length, offset, results: scored.slice(offset, offset + limit).map(({ d, score }) => ({ id: d.id, title: d.title, category: d.category, date: d.date, tags: d.tags, snippet: d.body.slice(0, 180), score })) });
  }
  if (seg[1] === 'kb' && seg[2]) {
    const d = S.kb.find((x) => x.id === decodeURIComponent(seg[2]));
    return d ? json(res, 200, d) : apiError(res, 404, 'doc_not_found', `Unknown document ${seg[2]}.`);
  }
  if (seg[1] === 'conversations' && seg[2]) {
    const c = S.conversations.get(seg[2]);
    return c ? json(res, 200, { conversation_id: seg[2], user_id: c.user_id, turns: c.turns }) : apiError(res, 404, 'conversation_not_found', 'Unknown conversation.');
  }
  return apiError(res, 404, 'not_found', `No route for GET ${p}`);
}

http
  .createServer((req, res) =>
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) apiError(res, 500, 'internal', 'Mock server error.');
      else res.destroy();
    }))
  .listen(PORT, () => {
    console.log(`Sofra mock listening on ${ORIGIN}`);
    console.log(`server_now=${nowIso()}  token_ttl=${TOKEN_TTL_S}s  short_ttl=${SHORT_TTL_S}s${GLOBAL_CHAOS ? `  CHAOS=${GLOBAL_CHAOS}` : ''}`);
  });
