import type { ReactNode } from 'react';
import { useCart, useOrders, type Cart, type Order } from '../../api/queries';
import { useChat, useChatStore, useServerToday } from '../../app/AppContext';
import { formatDay, formatTry, relativeDay } from '../../core/format';
import { OrderNote, StatusPill } from '../blocks/DataBlocks';
import { cuisineLook, Food } from '../food/icons';
import { Icon } from '../Icon';
import styles from './shell.module.css';

/**
 * The cart and the orders, read from the REST API and refetched after every
 * action. The buttons here send messages; the assistant answers with a gate or
 * a confirmation card, and only that card can execute anything.
 */
export function RightPanel() {
  const userId = useChat((state) => state.userId);
  const cart = useCart(userId);
  const orders = useOrders(userId);

  return (
    <aside className={styles.panel} aria-label="Your cart and orders">
      <Section
        title="Your cart"
        query={cart}
        badge={cart.data ? `${cart.data.items.length} item${cart.data.items.length === 1 ? '' : 's'}` : undefined}
      >
        {(data) => <CartView cart={data} />}
      </Section>
      <Section title="Orders" query={orders}>
        {(data) => <OrdersView orders={data} />}
      </Section>
    </aside>
  );
}

interface QueryLike<T> {
  data: T | undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

/** One designed state for each of loading, failed, refreshing and loaded. */
function Section<T>({
  title,
  query,
  badge,
  children,
}: {
  title: string;
  query: QueryLike<T>;
  badge?: string | undefined;
  children: (data: T) => ReactNode;
}) {
  return (
    <section className={styles.section} aria-busy={query.isFetching}>
      <div className={styles.sectionHead}>
        <h2>{title}</h2>
        <span className={styles.sectionNote}>{query.isFetching && query.data !== undefined ? 'Updating…' : badge}</span>
      </div>
      {query.data !== undefined ? (
        children(query.data)
      ) : query.isError ? (
        <div className={styles.panelMessage}>
          <p>
            <Icon name="alert" size={15} /> Could not load {title.toLowerCase()}.
          </p>
          <button type="button" className="button" onClick={() => void query.refetch()}>
            <Icon name="retry" size={15} /> Try again
          </button>
        </div>
      ) : (
        <p className={`${styles.panelMessage} muted`}>Loading {title.toLowerCase()}…</p>
      )}
    </section>
  );
}

function CartView({ cart }: { cart: Cart }) {
  const store = useChatStore();
  if (cart.items.length === 0) return <p className="muted">Your cart is empty.</p>;
  const { quote } = cart;
  return (
    <div className={styles.cart}>
      {cart.restaurant_name && (
        <div className={styles.restoRow}>
          <span className={styles.thumb} style={{ background: cuisineLook(undefined).tint }}>
            <Food icon="plate" color="var(--ink-muted)" size={20} />
          </span>
          <strong>{cart.restaurant_name}</strong>
        </div>
      )}
      <ul className={styles.lines}>
        {cart.items.map((item) => (
          <li key={item.item_id} className={styles.line}>
            <span>
              <span className={styles.qty}>{item.qty}×</span> {item.name}
            </span>
            <span className={styles.price}>{formatTry(item.price_try)}</span>
          </li>
        ))}
      </ul>
      {/* The quote is the server's. Nothing is added up here. */}
      {quote && (
        <dl className={styles.totals}>
          <div className={styles.line}>
            <dt>Subtotal</dt>
            <dd>{formatTry(quote.subtotal_try)}</dd>
          </div>
          <div className={styles.line}>
            <dt>{quote.delivery_fee_try === 0 ? 'Delivery (free)' : 'Delivery'}</dt>
            <dd>{formatTry(quote.delivery_fee_try)}</dd>
          </div>
          <div className={`${styles.line} ${styles.total}`}>
            <dt>Total</dt>
            <dd>{formatTry(quote.total_try)}</dd>
          </div>
          {!quote.meets_minimum && (
            <p className={styles.warning}>
              <Icon name="alert" size={16} /> Below the minimum order of {formatTry(quote.min_order_try)}.
            </p>
          )}
        </dl>
      )}
      <button type="button" className="button button-dark" onClick={() => store.getState().send('Order what is in my cart')}>
        Order what is in my cart
      </button>
      <p className={styles.hint}>Sends a message. Nothing is charged until you confirm on the card Sofra answers with.</p>
    </div>
  );
}

function OrdersView({ orders }: { orders: readonly Order[] }) {
  const today = useServerToday();
  if (orders.length === 0) return <p className="muted">No orders yet.</p>;
  const active = orders.filter((order) => order.status === 'received');
  const past = orders.filter((order) => order.status !== 'received');
  return (
    <div className={styles.orders}>
      {active.map((order) => (
        <ActiveOrder key={order.order_id} order={order} today={today} />
      ))}
      {past.length > 0 && active.length > 0 && <h3 className={styles.subhead}>Past orders</h3>}
      <ul className={styles.pastList}>
        {past.map((order) => (
          <li key={order.order_id} className={styles.pastRow}>
            <div>
              <strong>{order.restaurant}</strong>
              <span className="muted">
                <span className="mono">{order.order_id}</span> · {formatDay(order.date)} · {formatTry(order.total_try)}
                {order.tips_try !== undefined && order.tips_try > 0 && ` · tip ${formatTry(order.tips_try)}`}
              </span>
              {/* Written by a customer: plain text, like every field that is not text.markdown. */}
              {order.note && <OrderNote note={order.note} />}
            </div>
            <StatusPill status={order.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An order the restaurant has received. The list carries no ETA, so none is shown. */
function ActiveOrder({ order, today }: { order: Order; today: string | null }) {
  const store = useChatStore();
  return (
    <article className={styles.activeOrder}>
      <div className={styles.sectionHead}>
        <strong>{order.restaurant}</strong>
        <StatusPill status={order.status} />
      </div>
      <span className="muted">
        <span className="mono">{order.order_id}</span> · {relativeDay(order.date, today) ?? formatDay(order.date)} · {formatTry(order.total_try)}
      </span>
      <div className={styles.tracker} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.track} />
        <span className={`${styles.dot} ${styles.dotOpen}`} />
      </div>
      <div className={styles.trackLabels}>
        <span>Received</span>
        <span className="muted">Delivered</span>
      </div>
      {order.note && <OrderNote note={order.note} />}
      <div className={styles.actions}>
        <button type="button" className="chip-button" onClick={() => store.getState().send(`Cancel order ${order.order_id}`)}>
          Cancel order
        </button>
        <button type="button" className="chip-button" onClick={() => store.getState().send(`Leave a tip on ${order.order_id}`)}>
          Leave a tip
        </button>
      </div>
    </article>
  );
}
