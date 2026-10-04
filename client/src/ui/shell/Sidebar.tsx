import { NavLink } from 'react-router';
import { useOrders, useProfile, useUsers } from '../../api/queries';
import { useChat, useChatStore } from '../../app/AppContext';
import { formatTry } from '../../core/format';
import { Logo } from '../food/icons';
import { Icon } from '../Icon';
import { LoadingNote, Skeleton } from '../Skeleton';
import styles from './shell.module.css';

interface Props {
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}

/**
 * The left rail: where you are, who you are, where food goes, how much is in
 * the wallet. Everything in it is read from the REST API; the wallet is
 * refetched after every action, so it is never a number the client computed.
 */
export function Sidebar({ inspectorOpen, onToggleInspector }: Props) {
  const store = useChatStore();
  const userId = useChat((state) => state.userId);
  const hasConversation = useChat((state) => state.items.length > 0);
  const users = useUsers();
  const profile = useProfile(userId);
  const orders = useOrders(userId);
  const active = orders.data?.filter((order) => order.status === 'received').length ?? 0;

  return (
    <aside className={styles.side} aria-label="Account">
      <div className={styles.brand}>
        <Logo size={32} />
        <span>Sofra</span>
      </div>

      <nav className={styles.nav} aria-label="Sections">
        <NavLink to="/" end className={styles.navItem}>
          <Icon name="home" size={18} /> Assistant
        </NavLink>
        {/* Not a page on the server: it only clears the screen. The next message opens a new conversation. */}
        <button type="button" className={styles.navItem} disabled={!hasConversation} onClick={() => store.getState().newConversation()}>
          <Icon name="plus" size={18} /> New conversation
        </button>
        <NavLink to="/help" className={styles.navItem}>
          <Icon name="question" size={18} /> Help center
        </NavLink>
      </nav>

      <div className={styles.sideCards}>
        <div className={styles.sideCard} aria-busy={profile.isPending}>
          <span className={styles.label}>Deliver to</span>
          {profile.data ? (
            <span className={styles.strong}>{profile.data.address ?? profile.data.district ?? '—'}</span>
          ) : profile.isError ? (
            <span className={styles.strong}>Address unavailable</span>
          ) : (
            <>
              <Skeleton width="75%" height={18} />
              <LoadingNote what="address" />
            </>
          )}
          <span className={styles.activeNote}>
            {active > 0 && (
              <>
                <Icon name="clock" size={13} /> {active} order{active > 1 ? 's' : ''} on the way
              </>
            )}
          </span>
        </div>

        <div className={styles.sideCard}>
          <label className={styles.label} htmlFor="user-select">
            User
          </label>
          {/* No authentication in the mock: these four users exist to exercise the gates. Their ids say which. */}
          <select id="user-select" className="select" value={userId} onChange={(event) => store.getState().switchUser(event.target.value)}>
            {users.data ? (
              users.data.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name} · {user.id}
                </option>
              ))
            ) : (
              <option value={userId}>{userId}</option>
            )}
          </select>
          {/* The raw flags behind the gates, as the server sends them. */}
          <p className={styles.facts} aria-label="Account flags">
            {profile.data ? (
              <>
                <span>payment_method: {String(profile.data.payment_method ?? '—')}</span>
                <span>age_verified: {String(profile.data.age_verified ?? '—')}</span>
                <span>district: {profile.data.district ?? '—'}</span>
              </>
            ) : (
              <Skeleton width="90%" height={11} />
            )}
          </p>
          <div className={styles.wallet} aria-live="polite">
            <span className={styles.label}>Wallet</span>
            <b data-busy={profile.isFetching}>
              {profile.data ? formatTry(profile.data.wallet_balance_try) : profile.isError ? 'unavailable' : <Skeleton width={64} height={18} />}
            </b>
          </div>
          {profile.isError && (
            <button type="button" className="button" onClick={() => void profile.refetch()}>
              <Icon name="retry" size={15} /> Retry
            </button>
          )}
        </div>

        <button type="button" className="button" aria-expanded={inspectorOpen} aria-controls="inspector" onClick={onToggleInspector}>
          Audit inspector
        </button>
      </div>
    </aside>
  );
}
