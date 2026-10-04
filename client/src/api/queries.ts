import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { accountKey, http } from '../app/services';
import { readApiError } from './http';

// The plain REST reads behind the shell (header, cart, orders). They are
// validated like everything else that comes from the server: a balance that is
// not a number is an error state, not "NaN TL". Extra fields are ignored here;
// the fields we display must have the right type.

const userSummarySchema = z.object({ id: z.string(), display_name: z.string(), district: z.string().optional() });

const profileSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  wallet_balance_try: z.number(),
  district: z.string().optional(),
  address: z.string().optional(),
});

const cartSchema = z.object({
  restaurant_id: z.string().nullable(),
  restaurant_name: z.string().nullable(),
  items: z.array(z.object({ item_id: z.string(), qty: z.number().int(), name: z.string(), price_try: z.number() })),
  quote: z
    .object({
      subtotal_try: z.number(),
      delivery_fee_try: z.number(),
      total_try: z.number(),
      min_order_try: z.number(),
      meets_minimum: z.boolean(),
    })
    .nullable(),
});

const orderSchema = z.object({
  order_id: z.string(),
  date: z.string(),
  restaurant: z.string(),
  total_try: z.number(),
  status: z.string(),
  note: z.string().optional(),
  tips_try: z.number().optional(),
});

const kbDocSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  category: z.string(),
  tags: z.array(z.string()).optional(),
  date: z.string().nullish(),
});

export type UserSummary = z.infer<typeof userSummarySchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Cart = z.infer<typeof cartSchema>;
export type Order = z.infer<typeof orderSchema>;
export type KbDoc = z.infer<typeof kbDocSchema>;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function getJson<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const response = await http.get(path, signal);
  if (!response.ok) {
    const { code, message } = await readApiError(response);
    throw new ApiError(code, message, response.status);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError('invalid_response', 'The server sent data this app cannot read.', response.status);
  return parsed.data;
}

const id = encodeURIComponent;

export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: ({ signal }) => getJson('/api/users', z.array(userSummarySchema), signal) });

export const useProfile = (userId: string) =>
  useQuery({ queryKey: [...accountKey(userId), 'profile'], queryFn: ({ signal }) => getJson(`/api/users/${id(userId)}`, profileSchema, signal) });

export const useCart = (userId: string) =>
  useQuery({ queryKey: [...accountKey(userId), 'cart'], queryFn: ({ signal }) => getJson(`/api/users/${id(userId)}/cart`, cartSchema, signal) });

export const useOrders = (userId: string) =>
  useQuery({
    queryKey: [...accountKey(userId), 'orders'],
    queryFn: ({ signal }) => getJson(`/api/users/${id(userId)}/orders`, z.array(orderSchema), signal),
  });

export const useKbDoc = (docId: string | null) =>
  useQuery({
    queryKey: ['kb', docId],
    queryFn: ({ signal }) => getJson(`/api/kb/${id(docId ?? '')}`, kbDocSchema, signal),
    enabled: docId !== null,
    staleTime: 60_000,
  });

const kbSearchSchema = z.object({
  total: z.number().int(),
  offset: z.number().int(),
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      category: z.string(),
      date: z.string().nullish(),
      tags: z.array(z.string()).optional(),
      snippet: z.string(),
    }),
  ),
});

export type KbHit = z.infer<typeof kbSearchSchema>['results'][number];

export const KB_PAGE_SIZE = 20;

/** One page of help-center search results. The order is the server's relevance order. */
export const useKbSearch = (query: string, category: string, page: number) =>
  useQuery({
    queryKey: ['kb-search', query, category, page],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ q: query, limit: String(KB_PAGE_SIZE), offset: String((page - 1) * KB_PAGE_SIZE) });
      if (category) params.set('category', category);
      return getJson(`/api/kb/search?${params}`, kbSearchSchema, signal);
    },
    // The previous page stays on screen while the next one loads, so the list does not collapse and jump.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

const restaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  cuisine: z.string().optional(),
  rating: z.number().optional(),
  delivery_fee_try: z.number().optional(),
  min_order_try: z.number().optional(),
  eta_min: z.number().int().optional(),
  district: z.string().optional(),
});

export type Restaurant = z.infer<typeof restaurantSchema>;

/** Restaurants that deliver to a district, in the server's order. */
export const useRestaurants = (district: string | undefined) =>
  useQuery({
    queryKey: ['restaurants', district],
    enabled: district !== undefined,
    staleTime: 60_000,
    queryFn: ({ signal }) => getJson(`/api/restaurants?near_district=${encodeURIComponent(district ?? '')}`, z.array(restaurantSchema), signal),
  });
