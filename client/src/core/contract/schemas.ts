// Decision: The catalog as strict schemas: an unknown field is a violation, params is opaque, expires_at and the token are checked harder than the JSON schema asks.
// Pinned by: core/contract/contract.test.ts (agreement with schema/ui_spec.schema.json on 37 fixtures); core/contract/parseBlock.test.ts

import { z } from 'zod';

// Mirrors schema/ui_spec.schema.json, the contract the assistant speaks.
//
// Two deliberate choices:
//
// 1. Every block is a strictObject. The JSON schema says
//    `additionalProperties: false`, so a field we do not know is a contract
//    violation and the block is rejected. Zod's default would strip it
//    silently and render the rest as if nothing happened.
//
// 2. A few fields are checked more tightly than the JSON schema asks, where
//    the client's behaviour depends on them (see confirmation_prompt).
//
// z.number() already rejects NaN and ±Infinity, so a valid block can never
// produce "NaN TL".

export const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const text = z.strictObject({
  type: z.literal('text'),
  markdown: z.string(),
});

const restaurantCard = z.strictObject({
  type: z.literal('restaurant_card'),
  restaurant_id: z.string(),
  name: z.string(),
  cuisine: z.string().optional(),
  rating: z.number().optional(),
  delivery_fee_try: z.number().optional(),
  min_order_try: z.number().optional(),
  eta_min: z.number().int().optional(),
  district: z.string().optional(),
});

const menuItem = z.strictObject({
  type: z.literal('menu_item'),
  item_id: z.string(),
  name: z.string(),
  price_try: z.number(),
  available: z.boolean(),
  age_restricted: z.boolean(),
  category: z.string().optional(),
});

const cartSummary = z.strictObject({
  type: z.literal('cart_summary'),
  restaurant_id: z.string().optional(),
  items: z.array(
    z.strictObject({
      name: z.string(),
      qty: z.number().int(),
      price_try: z.number(),
    }),
  ),
  subtotal_try: z.number().optional(),
  delivery_fee_try: z.number().optional(),
  total_try: z.number(),
  min_order_try: z.number().optional(),
  meets_minimum: z.boolean().optional(),
});

const orderSummary = z.strictObject({
  type: z.literal('order_summary'),
  order_id: z.string(),
  restaurant: z.string().optional(),
  total_try: z.number().optional(),
  status: z.string(),
  eta_min: z.number().int().optional(),
  date: z.string().optional(),
  note: z.string().optional(),
});

export const ACTIONS = ['place_order', 'cancel_order', 'add_tip'] as const;

const confirmationPrompt = z.strictObject({
  type: z.literal('confirmation_prompt'),
  action: z.enum(ACTIONS),
  summary: z.string(),
  // `params` is what the confirm token is bound to, and it must go back to the
  // server exactly as it arrived. z.object() would rebuild it and drop keys it
  // does not know, which the server answers with params_mismatch. z.custom()
  // only checks the shape and hands back the very same object.
  params: z.custom<Readonly<Record<string, unknown>>>(isPlainObject, 'params must be an object'),
  // Tighter than the JSON schema ("type": "string"): an empty token or an
  // unreadable deadline would give us a Confirm control we cannot reason about.
  confirm_token: z.string().min(1),
  expires_at: z.iso.datetime({ offset: true }),
});

export const GATE_REQUIREMENTS = [
  'out_of_service_area',
  'item_unavailable',
  'age_18_plus',
  'min_order',
  'sufficient_funds',
  'not_cancellable',
  'tip_window_expired',
] as const;

const verificationGate = z.strictObject({
  type: z.literal('verification_gate'),
  requirement: z.enum(GATE_REQUIREMENTS),
  reason: z.string(),
  cta: z.string(),
});

const suggestedActions = z.strictObject({
  type: z.literal('suggested_actions'),
  chips: z.array(z.string()),
});

const error = z.strictObject({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

/** The v1 component catalog. A `type` that is not a key here is an unknown block. */
export const BLOCK_SCHEMAS = {
  text,
  restaurant_card: restaurantCard,
  menu_item: menuItem,
  cart_summary: cartSummary,
  order_summary: orderSummary,
  confirmation_prompt: confirmationPrompt,
  verification_gate: verificationGate,
  suggested_actions: suggestedActions,
  error,
} as const;

export type BlockType = keyof typeof BLOCK_SCHEMAS;
export type BlockOf<T extends BlockType> = z.infer<(typeof BLOCK_SCHEMAS)[T]>;
export type Block = { [T in BlockType]: BlockOf<T> }[BlockType];
export type Action = (typeof ACTIONS)[number];
export type GateRequirement = (typeof GATE_REQUIREMENTS)[number];

export const DECISIONS = ['answered', 'needs_confirmation', 'blocked', 'clarify', 'refused', 'unknown'] as const;

// The audit object has no `additionalProperties: false` in the contract, so
// extra fields are tolerated here (and dropped: the inspector shows the raw
// record next to the parsed one).
export const auditSchema = z.object({
  decision: z.enum(DECISIONS),
  reason: z.string().optional(),
  intent: z.string().optional(),
  user_id: z.string().optional(),
  tools_called: z.array(z.string()).optional(),
  kb_doc_ids: z.array(z.string()).optional(),
});

export type Audit = z.infer<typeof auditSchema>;
export type Decision = (typeof DECISIONS)[number];

export const SUPPORTED_VERSION = '1';

export const formatIssue = (issue: z.core.$ZodIssue): string => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`;
