import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { useCart } from '../../api/queries';
import { useChat } from '../../app/AppContext';
import { Logo } from '../food/icons';
import { Icon } from '../Icon';
import styles from './shell.module.css';

/**
 * On a small screen the rail and the panel become sheets, opened from a top
 * bar, the way chat apps do it. A native <dialog> gives the focus trap,
 * Escape and the backdrop for free.
 */
export function MobileBar({ onMenu, onCart }: { onMenu: () => void; onCart: () => void }) {
  const userId = useChat((state) => state.userId);
  const cart = useCart(userId);
  const count = cart.data?.items.length ?? 0;
  return (
    <header className={styles.mobileBar}>
      <button type="button" className={styles.barButton} aria-label="Menu" onClick={onMenu}>
        <Icon name="menu" size={22} />
      </button>
      <span className={styles.barBrand}>
        <Logo size={26} /> Sofra
      </span>
      <button
        type="button"
        className={styles.barButton}
        aria-label={`Cart and orders${count ? `, ${count} item${count === 1 ? '' : 's'} in the cart` : ''}`}
        onClick={onCart}
      >
        <Icon name="cart" size={22} />
        {count > 0 && <span className={styles.barBadge}>{count}</span>}
      </button>
    </header>
  );
}

interface DrawerProps {
  open: boolean;
  side: 'left' | 'right';
  label: string;
  onClose: () => void;
  children: ReactNode;
}

export function Drawer({ open, side, label, onClose, children }: DrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // A tap on the backdrop, or on any link or button inside (a section, "New
  // conversation", an action in the panel), closes the sheet. The select does not.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    const target = event.target as HTMLElement;
    if (target === event.currentTarget || target.closest('a, button')) onClose();
  };

  return (
    <dialog ref={dialog} className={`drawer ${side === 'right' ? 'drawer-right' : ''}`} aria-label={label} onClose={onClose} onClick={onClick}>
      {children}
    </dialog>
  );
}
