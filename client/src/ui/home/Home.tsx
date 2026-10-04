import { useOrders, useProfile, useRestaurants } from '../../api/queries';
import { useChat, useChatStore } from '../../app/AppContext';
import { formatTry } from '../../core/format';
import { RestaurantCard } from '../blocks/DataBlocks';
import { Carousel } from '../Carousel';
import { CATEGORIES, Food } from '../food/icons';
import { Icon } from '../Icon';
import { LoadingNote, RestaurantCardSkeleton, Skeleton } from '../Skeleton';
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

      <div aria-busy={!restaurants.data && !restaurants.isError}>
        {restaurants.data ? (
          <Carousel label="Restaurants" heading={<h2>Delivering to {profile.data?.district ?? '…'}</h2>} note="The server's order">
            {restaurants.data.map((restaurant) => (
              <li key={restaurant.id}>
                <RestaurantCard block={{ type: 'restaurant_card', restaurant_id: restaurant.id, ...restaurant }} />
              </li>
            ))}
          </Carousel>
        ) : restaurants.isError ? (
          <>
            <h2 className={styles.heading}>Delivering to {profile.data?.district ?? '…'}</h2>
            <p className={styles.message}>
              <Icon name="alert" size={15} /> Could not load restaurants.
              <button type="button" className="button" onClick={() => void restaurants.refetch()}>
                Try again
              </button>
            </p>
          </>
        ) : (
          <Carousel label="Restaurants" heading={<h2>Delivering to {profile.data?.district ?? '…'}</h2>} note="The server's order">
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <RestaurantCardSkeleton />
              </li>
            ))}
            <LoadingNote what="restaurants" />
          </Carousel>
        )}
      </div>

      <div className={styles.twoUp}>
        <div className={styles.promo} aria-busy={orders.isPending}>
          <div>
            <span className={styles.label}>Your last order</span>
            {last ? (
              <>
                <strong>
                  {last.restaurant} · {formatTry(last.total_try)}
                </strong>
                <span className="muted">
                  <span className="mono">{last.order_id}</span> · {last.status}
                </span>
              </>
            ) : orders.isPending ? (
              <>
                <Skeleton width="60%" height={18} />
                <Skeleton width="45%" height={12} />
                <LoadingNote what="orders" />
              </>
            ) : (
              <strong>No orders yet</strong>
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
