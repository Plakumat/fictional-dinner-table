import { useOrders, useProfile, useRestaurants } from '../../api/queries';
import { useChat, useChatStore } from '../../app/AppContext';
import { formatTry } from '../../core/format';
import { RestaurantCard } from '../blocks/DataBlocks';
import { CATEGORIES, Food } from '../food/icons';
import { Icon } from '../Icon';
import styles from './home.module.css';

/**
 * The start screen, shown while the conversation is empty.
 *
 * Every control here sends a message to the assistant; none of them orders,
 * cancels or pays. The restaurants are the ones the server says deliver to the
 * user's district, in the server's order.
 */
export function Home() {
  const store = useChatStore();
  const userId = useChat((state) => state.userId);
  const profile = useProfile(userId);
  const restaurants = useRestaurants(profile.data?.district);
  const orders = useOrders(userId);
  const last = orders.data?.[0];
  const firstName = profile.data?.display_name.split(' ')[0];
  const send = (text: string) => store.getState().send(text);

  return (
    <div className={styles.home}>
      <div className={styles.hero}>
        <h1>What are you craving{firstName ? `, ${firstName}` : ''}?</h1>
        <p className="muted">Tell Sofra in your own words, or start from a category. Anything that spends money waits for your confirmation.</p>
      </div>

      <ul className={styles.tiles} aria-label="Categories">
        {CATEGORIES.map((category) => (
          <li key={category.label}>
            <button type="button" className={styles.tile} onClick={() => send(category.message)}>
              <Food icon={category.icon} size={34} />
              {category.label}
            </button>
          </li>
        ))}
      </ul>

      <section aria-labelledby="near-you">
        <div className={styles.sectionHead}>
          <h2 id="near-you">Delivering to {profile.data?.district ?? '…'}</h2>
          <span className="muted">The server's order</span>
        </div>
        {restaurants.data ? (
          <ul className={styles.carousel} aria-label="Restaurants">
            {restaurants.data.map((restaurant) => (
              <li key={restaurant.id}>
                <RestaurantCard block={{ type: 'restaurant_card', restaurant_id: restaurant.id, ...restaurant }} />
              </li>
            ))}
          </ul>
        ) : restaurants.isError ? (
          <p className={styles.message}>
            <Icon name="alert" size={15} /> Could not load restaurants.
            <button type="button" className="button" onClick={() => void restaurants.refetch()}>
              Try again
            </button>
          </p>
        ) : (
          <p className="muted">Loading restaurants…</p>
        )}
      </section>

      <div className={styles.twoUp}>
        <div className={styles.promo}>
          <div>
            <span className={styles.label}>Your last order</span>
            <strong>{last ? `${last.restaurant} · ${formatTry(last.total_try)}` : orders.isPending ? '…' : 'No orders yet'}</strong>
            {last && (
              <span className="muted">
                <span className="mono">{last.order_id}</span> · {last.status}
              </span>
            )}
          </div>
          {/* The order list carries no line items, so there is nothing to reorder from. */}
          <button type="button" className="button" onClick={() => send('Show my recent orders')}>
            See orders
          </button>
        </div>
        <div className={`${styles.promo} ${styles.promoTint}`}>
          <div>
            <span className={styles.label}>Try asking</span>
            <strong>"What is in my cart?"</strong>
            <span className="muted">Sofra answers with cards you can act on.</span>
          </div>
          <button type="button" className="button" onClick={() => send('What is in my cart?')}>
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
