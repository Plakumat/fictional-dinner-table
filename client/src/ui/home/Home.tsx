import { useOrders, useProfile, useRestaurants } from '../../api/queries';
import { useChat, useChatStore } from '../../app/AppContext';
import { formatTry } from '../../core/format';
import { RestaurantCard } from '../blocks/DataBlocks';
import { Carousel } from '../Carousel';
import { CATEGORIES, cuisineLook, Food } from '../food/icons';
import { Icon } from '../Icon';
import { LoadingNote, RestaurantCardSkeleton, Skeleton } from '../Skeleton';
import { COMPACT, useMediaQuery } from '../useMediaQuery';
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
  const compact = useMediaQuery(COMPACT);

  // On a phone the start screen must leave room for the conversation: one
  // line of category chips, three restaurants as short rows, nothing else.
  if (compact) {
    return (
      <div className={styles.home}>
        <div className={styles.hero}>
          <h1>What are you craving{firstName ? `, ${firstName}` : ''}?</h1>
          <p className="muted">Ask in your own words, or start from a category.</p>
        </div>

        <ul className={styles.chipRow} aria-label="Categories">
          {CATEGORIES.map((category) => (
            <li key={category.label}>
              <button type="button" className="chip-button" onClick={() => send(category.message)}>
                <Food icon={category.icon} size={16} color="var(--accent)" /> {category.label}
              </button>
            </li>
          ))}
        </ul>

        <section aria-label="Restaurants" aria-busy={!restaurants.data && !restaurants.isError}>
          <h2 className={styles.heading}>Near you{profile.data?.district ? ` in ${profile.data.district}` : ''}</h2>
          {restaurants.data ? (
            <ul className={styles.compactList}>
              {restaurants.data.slice(0, 3).map((restaurant) => {
                const look = cuisineLook(restaurant.cuisine);
                return (
                  <li key={restaurant.id}>
                    <button type="button" className={styles.compactRow} onClick={() => send(`Show the ${restaurant.name} menu`)}>
                      <span className={styles.compactThumb} style={{ background: look.tint }} aria-hidden="true">
                        <Food icon={look.icon} color={look.ink} size={20} />
                      </span>
                      <span className={styles.compactText}>
                        <strong>{restaurant.name}</strong>
                        <span className="muted">
                          {[
                            restaurant.rating !== undefined && `★ ${restaurant.rating}`,
                            restaurant.eta_min !== undefined && `${restaurant.eta_min} min`,
                            restaurant.delivery_fee_try !== undefined && `Delivery ${formatTry(restaurant.delivery_fee_try)}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <Icon name="right" size={16} />
                    </button>
                  </li>
                );
              })}
              <li>
                <button type="button" className="chip-button" onClick={() => send('Which restaurants are near me?')}>
                  All restaurants near me
                </button>
              </li>
            </ul>
          ) : restaurants.isError ? (
            <p className={styles.message}>
              <Icon name="alert" size={15} /> Could not load restaurants.
            </p>
          ) : (
            <div className={styles.compactList} aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={56} radius={14} />
              ))}
              <LoadingNote what="restaurants" />
            </div>
          )}
        </section>
      </div>
    );
  }

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
