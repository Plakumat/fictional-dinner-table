import { useState } from 'react';
import { useChatStore } from '../../app/AppContext';
import type { BlockOf } from '../../core/contract/schemas';
import { formatDay, formatTry, relativeDay } from '../../core/format';
import { Carousel } from '../Carousel';
import { cuisineLook, Food } from '../food/icons';
import { Icon, type IconName } from '../Icon';
import styles from './blocks.module.css';

// The read-only blocks. They receive validated blocks and display their
// fields. Everything except text.markdown is plain text: React escapes it, and
// none of these components ever builds HTML from a string. Their buttons send
// messages; none of them executes anything.

export function RestaurantCard({ block }: { block: BlockOf<'restaurant_card'> }) {
  const store = useChatStore();
  const look = cuisineLook(block.cuisine);
  return (
    <article className={styles.restaurant}>
      {/* No photos in the data: the cuisine gets a drawing and a tint of its own. */}
      <div className={styles.cover} style={{ background: look.tint }} aria-hidden="true">
        <Food icon={look.icon} color={look.ink} size={60} />
      </div>
      <div className={styles.restaurantBody}>
        <div className={styles.restaurantTitle}>
          <h3 className={styles.title}>{block.name}</h3>
          {block.rating !== undefined && <span className={styles.rating}>★ {block.rating}</span>}
        </div>
        <p className={styles.meta}>
          {block.cuisine && <span>{block.cuisine}</span>}
          {block.district && <span>{block.district}</span>}
          {block.eta_min !== undefined && (
            <span>
              <b>{block.eta_min}</b> min
            </span>
          )}
          {block.delivery_fee_try !== undefined && (
            <span>
              Delivery <b>{formatTry(block.delivery_fee_try)}</b>
            </span>
          )}
          {block.min_order_try !== undefined && (
            <span>
              Min <b>{formatTry(block.min_order_try)}</b>
            </span>
          )}
        </p>
        <button type="button" className="chip-button" onClick={() => store.getState().send(`Show the ${block.name} menu`)}>
          See the menu
        </button>
      </div>
    </article>
  );
}

/** Several restaurant cards from one answer, side by side, in the server's order. */
export const RestaurantRow = ({ items }: { items: BlockOf<'restaurant_card'>[] }) => (
  <Carousel
    label="Restaurants"
    heading={<span className={styles.rowLabel}>{items.length === 1 ? '1 restaurant' : `${items.length} restaurants`}</span>}
  >
    {items.map((block) => (
      <li key={block.restaurant_id}>
        <RestaurantCard block={block} />
      </li>
    ))}
  </Carousel>
);

interface MenuProps {
  items: BlockOf<'menu_item'>[];
  /** The restaurant the menu belongs to, when the request named it. Without it, nothing can be ordered from here. */
  restaurant?: string | undefined;
}

/**
 * A menu: the menu_item blocks of one answer, grouped by their category.
 * The block does not say which restaurant it belongs to (a gap in the
 * contract); "+ Order 1" needs the name and is disabled without it.
 */
export function MenuCard({ items, restaurant }: MenuProps) {
  const store = useChatStore();
  const categories = [...new Set(items.map((item) => item.category ?? 'Menu'))];
  const [current, setCurrent] = useState<string | null>(null);
  const shown = current === null ? categories : categories.filter((c) => c === current);

  return (
    <section className={styles.menu} aria-label="Menu">
      {categories.length > 1 && (
        <div className={styles.menuTabs}>
          <button type="button" className={styles.tab} aria-pressed={current === null} onClick={() => setCurrent(null)}>
            All
          </button>
          {categories.map((category) => (
            <button key={category} type="button" className={styles.tab} aria-pressed={current === category} onClick={() => setCurrent(category)}>
              {category}
            </button>
          ))}
        </div>
      )}
      {shown.map((category) => (
        <div key={category}>
          {categories.length > 1 && <h3 className={styles.menuGroup}>{category}</h3>}
          <ul>
            {items
              .filter((item) => (item.category ?? 'Menu') === category)
              .map((item) => (
                <li key={item.item_id} className={styles.item} data-unavailable={!item.available}>
                  <div className={styles.itemBody}>
                    <span className={styles.itemName}>{item.name}</span>
                    {(!item.available || item.age_restricted) && (
                      <span className={styles.badges}>
                        {!item.available && (
                          <span className={styles.badgeDashed}>
                            <Icon name="blocked" size={12} /> Unavailable
                          </span>
                        )}
                        {item.age_restricted && <span className={styles.badge}>18+ · age check</span>}
                      </span>
                    )}
                  </div>
                  <span className={styles.price}>{formatTry(item.price_try)}</span>
                  <button
                    type="button"
                    className="chip-button"
                    disabled={!item.available || !restaurant}
                    title={restaurant ? undefined : 'This menu does not say which restaurant it belongs to'}
                    onClick={() => restaurant && store.getState().send(`Order 1 ${item.name} from ${restaurant}`)}
                  >
                    + Order 1
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** One menu item on its own (the workbench, or a single block in an answer). */
export const MenuItem = ({ block }: { block: BlockOf<'menu_item'> }) => <MenuCard items={[block]} />;

/** The line items of a cart, with the server's totals. Nothing is added up here. */
export function CartLines({ block, totals = true }: { block: BlockOf<'cart_summary'>; totals?: boolean }) {
  return (
    <>
      <ul className={styles.lines}>
        {block.items.map((item, i) => (
          <li key={i} className={styles.line}>
            <span>
              <span className={styles.qty}>{item.qty}×</span> {item.name}
            </span>
            <span className={`${styles.price} muted`}>{formatTry(item.price_try)} each</span>
          </li>
        ))}
      </ul>
      {totals && <CartTotals block={block} />}
      {block.meets_minimum === false && (
        <p className={styles.warning}>
          <Icon name="alert" size={16} />
          <span>
            Below the minimum order
            {block.min_order_try !== undefined && ` of ${formatTry(block.min_order_try)}`}.
          </span>
        </p>
      )}
    </>
  );
}

export const CartTotals = ({ block }: { block: BlockOf<'cart_summary'> }) => (
  <dl className={styles.totals}>
    {block.subtotal_try !== undefined && (
      <div className={styles.line}>
        <dt>Subtotal</dt>
        <dd>{formatTry(block.subtotal_try)}</dd>
      </div>
    )}
    {block.delivery_fee_try !== undefined && (
      <div className={styles.line}>
        <dt>Delivery</dt>
        <dd className={block.delivery_fee_try === 0 ? styles.free : undefined}>
          {block.delivery_fee_try === 0 ? 'Free' : formatTry(block.delivery_fee_try)}
        </dd>
      </div>
    )}
    <div className={`${styles.line} ${styles.total}`}>
      <dt>Total</dt>
      <dd>{formatTry(block.total_try)}</dd>
    </div>
  </dl>
);

export function CartSummary({ block }: { block: BlockOf<'cart_summary'> }) {
  return (
    <article className={styles.card}>
      <h3 className={styles.title}>Cart</h3>
      <CartLines block={block} />
    </article>
  );
}

const ORDER_STATUS: Record<string, { label: string; icon: IconName }> = {
  received: { label: 'Received', icon: 'clock' },
  delivered: { label: 'Delivered', icon: 'check' },
  cancelled: { label: 'Cancelled', icon: 'cross' },
};

/** The order's status in words, with an icon. A status we do not know is shown as the server wrote it. */
export function StatusPill({ status }: { status: string }) {
  const known = ORDER_STATUS[status];
  return (
    <span className={styles.pill} data-status={status}>
      <Icon name={known?.icon ?? 'info'} size={12} />
      {known?.label ?? status}
    </span>
  );
}

/** "18 Aug 2026 · 2 days ago". The relative part is measured against the server's today. */
export function OrderDate({ date, today }: { date: string; today: string | null }) {
  const relative = relativeDay(date, today);
  return (
    <>
      {formatDay(date)}
      {relative && ` · ${relative}`}
    </>
  );
}

/** A customer's note, verbatim, as text. */
export const OrderNote = ({ note }: { note: string }) => (
  <p className={styles.note}>
    <span className={styles.noteLabel}>Customer note</span>
    {note}
  </p>
);

export function OrderSummary({ block, today }: { block: BlockOf<'order_summary'>; today: string | null }) {
  return (
    <article className={styles.order}>
      <div className={styles.orderHead}>
        <h3 className={styles.title}>{block.restaurant ?? 'Order'}</h3>
        <StatusPill status={block.status} />
      </div>
      <p className={styles.meta}>
        <span className="mono">{block.order_id}</span>
        {block.date !== undefined && (
          <span>
            <OrderDate date={block.date} today={today} />
          </span>
        )}
        {block.total_try !== undefined && (
          <span>
            Total <b>{formatTry(block.total_try)}</b>
          </span>
        )}
      </p>
      {block.status === 'received' && (
        <div>
          <div className={styles.tracker} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.track} />
            <span className={`${styles.dot} ${styles.dotOpen}`} />
          </div>
          <div className={styles.trackLabels}>
            <span>Received</span>
            <span className="muted">Delivered</span>
          </div>
          {block.eta_min !== undefined && <p className={styles.eta}>Arrives in about {block.eta_min} min</p>}
        </div>
      )}
      {block.note && <OrderNote note={block.note} />}
    </article>
  );
}

export function ErrorBlock({ block }: { block: BlockOf<'error'> }) {
  return (
    <article className={styles.error}>
      <p className={styles.kicker}>
        <Icon name="alert" size={15} /> Error
      </p>
      <p>{block.message}</p>
      <p className="muted mono">{block.code}</p>
    </article>
  );
}

/** Chips. Choosing one sends its text as a new user message, and that is all it can do. */
export function SuggestedActions({ block, onChoose }: { block: BlockOf<'suggested_actions'>; onChoose: (text: string) => void }) {
  if (block.chips.length === 0) return null;
  return (
    <ul className={styles.chips} aria-label="Suggested messages">
      {block.chips.map((chip, i) => (
        <li key={i}>
          <button type="button" className="chip-button" onClick={() => onChoose(chip)}>
            {chip}
          </button>
        </li>
      ))}
    </ul>
  );
}
