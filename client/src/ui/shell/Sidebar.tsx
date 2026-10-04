import { NavLink } from 'react-router';
import { useOrders, useProfile, useUsers } from '../../api/queries';
import { useChat, useChatStore } from '../../app/AppContext';
import { formatTry } from '../../core/format';
import { Logo } from '../food/icons';
import { Icon } from '../Icon';
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
        <div className={styles.sideCard}>
          <span className={styles.label}>Deliver to</span>
          <span className={styles.strong}>{profile.data?.address ?? (profile.isError ? 'Address unavailable' : '…')}</span>
          {active > 0 && (
            <span className={styles.activeNote}>
              <Icon name="clock" size={13} /> {active} order{active > 1 ? 's' : ''} on the way
            </span>
          )}
        </div>

        <div className={styles.sideCard}>
          <label className={styles.label} htmlFor="user-select">
            User
          </label>
          {/* No authentication in the mock. Switching user starts a new conversation and voids live prompts. */}
          <select id="user-select" className={styles.select} value={userId} onChange={(event) => store.getState().switchUser(event.target.value)}>
            {users.data ? (
              users.data.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name}
                </option>
              ))
            ) : (
              <option value={userId}>{userId}</option>
            )}
          </select>
          <div className={styles.wallet} aria-live="polite">
            <span className={styles.label}>Wallet</span>
            <b data-busy={profile.isFetching}>{profile.data ? formatTry(profile.data.wallet_balance_try) : profile.isError ? 'unavailable' : '…'}</b>
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
