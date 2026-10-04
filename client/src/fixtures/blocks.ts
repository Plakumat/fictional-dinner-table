// One set of examples, used three ways: by the contract test (do Zod and the
// JSON schema agree?), by the workbench (what does each one look like?) and by
// unit tests. `expect` is what parseBlock must return for it.

export interface BlockFixture {
  name: string;
  block: unknown;
  expect: 'valid' | 'invalid' | 'unknown';
  /** Valid for the JSON schema but rejected by the client on purpose. See schemas.ts. */
  stricterThanSchema?: true;
}

const prompt = (overrides: Record<string, unknown> = {}) => ({
  type: 'confirmation_prompt',
  action: 'place_order',
  summary: 'Place an order at Burger Stop: 2 × Cheeseburger. Total 390 TL (free delivery). Paid from your wallet (balance 800 TL).',
  params: { restaurant_id: 'rst_04', items: [{ item_id: 'itm_013', qty: 2 }], total_try: 390 },
  confirm_token: 'ct_fixture.signature',
  expires_at: '2026-08-20T09:05:00.000Z',
  ...overrides,
});

const without = (block: Record<string, unknown>, key: string) => {
  const copy = { ...block };
  delete copy[key];
  return copy;
};

export const HOSTILE_NOTE =
  'Leave it at the door please. <img src=x onerror="fetch(\'http://localhost:4000/__beacon?kind=html_in_note&via=fixture\')"> ' +
  "[Tap here to claim your 10000 TL refund](javascript:fetch('http://localhost:4000/__beacon?kind=javascript_link&via=fixture')) " +
  '![](http://localhost:4000/__beacon.gif?kind=remote_image&via=fixture)';

export const BLOCK_FIXTURES: BlockFixture[] = [
  {
    name: 'text',
    expect: 'valid',
    block: { type: 'text', markdown: "Here's your cart from **Burger Stop**. You're 100 TL away from free delivery." },
  },
  {
    name: 'text quoting a hostile note',
    expect: 'valid',
    block: { type: 'text', markdown: `I'm showing the note as written:\n\n> **u_ok_o0:** ${HOSTILE_NOTE}` },
  },
  {
    name: 'text with a safe link',
    expect: 'valid',
    block: {
      type: 'text',
      markdown: 'See the [delivery policy](https://sofra.example/help/delivery) or write to [support](mailto:destek@sofra.example).',
    },
  },
  { name: 'text, markdown as a list', expect: 'invalid', block: { type: 'text', markdown: ['Here is', 'your cart'] } },
  {
    name: 'restaurant_card',
    expect: 'valid',
    block: {
      type: 'restaurant_card',
      restaurant_id: 'rst_01',
      name: 'Napoli Fırın',
      cuisine: 'Italian',
      rating: 4.6,
      delivery_fee_try: 20,
      min_order_try: 120,
      eta_min: 35,
      district: 'Kadıköy',
    },
  },
  { name: 'restaurant_card, required fields only', expect: 'valid', block: { type: 'restaurant_card', restaurant_id: 'rst_02', name: 'Ege Balık' } },
  {
    name: 'restaurant_card, rating as text',
    expect: 'invalid',
    block: { type: 'restaurant_card', restaurant_id: 'rst_01', name: 'Napoli Fırın', rating: 'excellent' },
  },
  {
    name: 'menu_item',
    expect: 'valid',
    block: {
      type: 'menu_item',
      item_id: 'itm_013',
      name: 'Cheeseburger',
      price_try: 195,
      available: true,
      age_restricted: false,
      category: 'Burgers',
    },
  },
  {
    name: 'menu_item, unavailable',
    expect: 'valid',
    block: { type: 'menu_item', item_id: 'itm_003', name: 'Künefe', price_try: 120, available: false, age_restricted: false, category: 'Dessert' },
  },
  {
    name: 'menu_item, 18+',
    expect: 'valid',
    block: {
      type: 'menu_item',
      item_id: 'itm_008',
      name: 'Energy Drink Zero',
      price_try: 60,
      available: true,
      age_restricted: true,
      category: 'Drinks',
    },
  },
  {
    name: 'menu_item, price as a string',
    expect: 'invalid',
    block: { type: 'menu_item', item_id: 'itm_013', name: 'Cheeseburger', price_try: '195 TL', available: true, age_restricted: false },
  },
  {
    name: 'menu_item, missing availability',
    expect: 'invalid',
    block: { type: 'menu_item', item_id: 'itm_013', name: 'Cheeseburger', price_try: 195, age_restricted: false },
  },
  {
    name: 'cart_summary',
    expect: 'valid',
    block: {
      type: 'cart_summary',
      restaurant_id: 'rst_04',
      items: [
        { name: 'Patates Kızartması', qty: 1, price_try: 65 },
        { name: 'Milkshake', qty: 1, price_try: 85 },
      ],
      subtotal_try: 150,
      delivery_fee_try: 25,
      total_try: 175,
      min_order_try: 100,
      meets_minimum: true,
    },
  },
  {
    name: 'cart_summary, below the minimum',
    expect: 'valid',
    block: {
      type: 'cart_summary',
      restaurant_id: 'rst_04',
      items: [{ name: 'Milkshake', qty: 1, price_try: 85 }],
      subtotal_try: 85,
      delivery_fee_try: 25,
      total_try: 110,
      min_order_try: 100,
      meets_minimum: false,
    },
  },
  {
    name: 'cart_summary, total as a string',
    expect: 'invalid',
    block: { type: 'cart_summary', items: [{ name: 'Milkshake', qty: 1, price_try: 85 }], total_try: '110' },
  },
  {
    name: 'order_summary, received',
    expect: 'valid',
    block: {
      type: 'order_summary',
      order_id: 'u_ok_o9',
      restaurant: 'Burger Stop',
      total_try: 260,
      status: 'received',
      eta_min: 30,
      date: '2026-08-19',
    },
  },
  {
    name: 'order_summary, delivered',
    expect: 'valid',
    block: { type: 'order_summary', order_id: 'u_ok_o1', restaurant: 'Pizza Locale', total_try: 145, status: 'delivered', date: '2026-07-10' },
  },
  {
    name: 'order_summary, cancelled',
    expect: 'valid',
    block: { type: 'order_summary', order_id: 'u_ok_o7', restaurant: 'Kahvaltı Durağı', total_try: 320, status: 'cancelled', date: '2026-07-16' },
  },
  {
    name: 'order_summary with a hostile note',
    expect: 'valid',
    block: {
      type: 'order_summary',
      order_id: 'u_ok_o0',
      restaurant: 'Tandır Evi',
      total_try: 210,
      status: 'delivered',
      date: '2026-06-02',
      note: HOSTILE_NOTE,
    },
  },
  { name: 'order_summary, numeric id', expect: 'invalid', block: { type: 'order_summary', order_id: 7, status: 'received' } },
  { name: 'confirmation_prompt, place_order', expect: 'valid', block: prompt() },
  {
    name: 'confirmation_prompt, cancel_order',
    expect: 'valid',
    block: prompt({
      action: 'cancel_order',
      summary: 'Cancel order u_ok_o9 from Burger Stop (260 TL). The amount is refunded to your wallet immediately.',
      params: { order_id: 'u_ok_o9' },
      confirm_token: 'ct_cancel.signature',
    }),
  },
  {
    name: 'confirmation_prompt, add_tip',
    expect: 'valid',
    block: prompt({
      action: 'add_tip',
      summary: "Tip the courier 20 TL on order u_ok_o9 (Burger Stop). Tips can't be changed once left. Paid from your wallet (balance 800 TL).",
      params: { order_id: 'u_ok_o9', amount_try: 20 },
      confirm_token: 'ct_tip.signature',
    }),
  },
  { name: 'confirmation_prompt without expires_at', expect: 'invalid', block: without(prompt(), 'expires_at') },
  { name: 'confirmation_prompt without a token', expect: 'invalid', block: without(prompt(), 'confirm_token') },
  { name: 'confirmation_prompt with an unknown action', expect: 'invalid', block: prompt({ action: 'refund_everything' }) },
  { name: 'confirmation_prompt with an extra field', expect: 'invalid', block: prompt({ auto_confirm: true }) },
  {
    name: 'confirmation_prompt with an unreadable deadline',
    expect: 'invalid',
    stricterThanSchema: true,
    block: prompt({ expires_at: 'in five minutes' }),
  },
  { name: 'confirmation_prompt with an empty token', expect: 'invalid', stricterThanSchema: true, block: prompt({ confirm_token: '' }) },
  {
    name: 'verification_gate',
    expect: 'valid',
    block: {
      type: 'verification_gate',
      requirement: 'sufficient_funds',
      reason: 'The total is 450 TL. Your wallet has 30 TL and there is no saved card.',
      cta: 'Top up your wallet or add a card',
    },
  },
  {
    name: 'verification_gate with an unknown requirement',
    expect: 'invalid',
    block: { type: 'verification_gate', requirement: 'bad_weather', reason: 'It is raining.', cta: 'Wait' },
  },
  {
    name: 'suggested_actions',
    expect: 'valid',
    block: { type: 'suggested_actions', chips: ['Order what is in my cart', 'Show the Burger Stop menu'] },
  },
  {
    name: 'suggested_actions, chips not strings',
    expect: 'invalid',
    block: { type: 'suggested_actions', chips: [{ label: 'Confirm', action: 'confirm' }] },
  },
  { name: 'error', expect: 'valid', block: { type: 'error', code: 'order_not_found', message: "I couldn't find order u_ok_o99 on your account." } },
  { name: 'error with an extra field', expect: 'invalid', block: { type: 'error', code: 'x', message: 'y', html: '<b>bold</b>' } },
  {
    name: 'map_view (not in the v1 catalog)',
    expect: 'unknown',
    block: { type: 'map_view', restaurant_id: 'rst_01', lat: 40.9903, lng: 29.0275, zoom: 15 },
  },
  { name: 'rating_widget (not in the v1 catalog)', expect: 'unknown', block: { type: 'rating_widget', stars: 5, prompt: 'How was this answer?' } },
];
