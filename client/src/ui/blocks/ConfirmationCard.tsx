import { useId } from 'react';
import type { Confirmation, Prompt } from '../../core/confirmation/machine';
import type { Action, BlockOf } from '../../core/contract/schemas';
import { formatCountdown } from '../../core/format';
import { Icon, type IconName } from '../Icon';
import { CartLines, CartTotals } from './DataBlocks';
import styles from './blocks.module.css';

/**
 * What the card shows. One more value than the machine has states:
 * - `pending`: the prompt is on screen but its response has not finished, so
 *   it is not registered and cannot be confirmed yet;
 * - `held`: it is live, but another answer is streaming and may replace it.
 */
export type CardState = Confirmation['status']['kind'] | 'pending' | 'held';

const COPY: Record<Action, { title: string; confirm: string; destructive: boolean }> = {
  place_order: { title: 'Place this order?', confirm: 'Place order', destructive: false },
  cancel_order: { title: 'Cancel this order?', confirm: 'Cancel this order', destructive: true },
  add_tip: { title: 'Send this tip?', confirm: 'Send tip', destructive: false },
};

const INERT: Partial<Record<CardState, { icon: IconName; kicker: string; text: string }>> = {
  confirming: { icon: 'clock', kicker: 'Confirming', text: 'Sending your confirmation…' },
  reconciling: {
    icon: 'clock',
    kicker: 'Checking',
    text: 'The connection dropped while confirming. Checking with Sofra whether it went through. Nothing will run twice.',
  },
  unresolved: {
    icon: 'question',
    kicker: 'Outcome unknown',
    text: 'Your confirmation was sent once, but Sofra could not be reached to learn the outcome. It may have gone through.',
  },
  confirmed: { icon: 'check', kicker: 'Confirmed', text: 'Done. The result is shown below.' },
  expired: { icon: 'clock', kicker: 'Expired', text: 'This confirmation ran out of time. Nothing was executed.' },
  superseded: { icon: 'replaced', kicker: 'Replaced', text: 'A newer confirmation replaced this one. It can no longer be used.' },
  rejected: { icon: 'blocked', kicker: 'Not executed', text: 'Sofra did not carry this out. What happens next is shown below.' },
  void: {
    icon: 'blocked',
    kicker: 'No longer valid',
    text: 'This confirmation could not be verified here, so it cannot be used. Nothing was executed.',
  },
};

const URGENT_MS = 30_000;

interface Props {
  prompt: Prompt;
  state: CardState;
  /** Time left on the server's clock, or null if unknown. */
  msLeft: number | null;
  /** The cart_summary the same answer sent just before the prompt, when there is one: its line items and totals are shown on the card. */
  cart?: BlockOf<'cart_summary'> | null | undefined;
  /** A previous attempt provably never reached the server. */
  notDelivered?: boolean;
  onConfirm: () => void;
  onRecheck: () => void;
  /** Sends the original request again to get a fresh confirmation. Absent when there is nothing to resend. */
  onAskAgain?: (() => void) | undefined;
}

/**
 * The checkout card: what food apps show on their payment screen, drawn
 * around a confirmation_prompt. Line items and totals are the server's
 * cart_summary block, the summary is the server's sentence, and the one
 * control on it is the only thing in the application that moves money.
 */
export function ConfirmationCard({ prompt, state, msLeft, cart = null, notDelivered = false, onConfirm, onRecheck, onAskAgain }: Props) {
  const copy = COPY[prompt.action];
  const awaitingUser = state === 'live' || state === 'held' || state === 'pending';
  const inert = INERT[state];
  const titleId = useId();
  const detailId = useId();

  return (
    <section className={styles.checkout} aria-labelledby={titleId} data-state={state} data-inert={!awaitingUser} data-destructive={copy.destructive}>
      <div className={styles.checkoutBar}>
        <span className={styles.kicker}>
          <Icon name={inert?.icon ?? 'question'} size={15} />
          {inert?.kicker ?? 'Needs your confirmation'}
        </span>
        {awaitingUser && msLeft !== null && (
          // Not a live region: a countdown read aloud every second would drown everything else.
          <span className={styles.countdown}>
            <Icon name={msLeft <= URGENT_MS ? 'alert' : 'clock'} size={14} />
            {msLeft <= URGENT_MS ? 'Expires soon: ' : 'Expires in '}
            {formatCountdown(msLeft)}
          </span>
        )}
      </div>

      <div className={styles.checkoutGrid}>
        <div className={styles.checkoutLeft}>
          <h3 id={titleId}>{copy.title}</h3>
          {cart && <CartLines block={cart} totals={false} />}
          <p id={detailId} className={styles.summary}>
            {prompt.summary}
          </p>
          {copy.destructive && awaitingUser && (
            <p className={styles.warning}>
              <Icon name="alert" size={16} />
              <span>This cancels the order. It cannot be undone.</span>
            </p>
          )}
        </div>

        <div className={styles.checkoutRight}>
          {cart && <CartTotals block={cart} />}
          {awaitingUser && (
            // type="button" and no autoFocus: this control is reached deliberately,
            // by pointer or by Tab. Enter in the composer cannot land here.
            <button
              type="button"
              className={`button ${styles.cta} ${copy.destructive ? 'button-danger' : 'button-primary'}`}
              disabled={state !== 'live'}
              aria-describedby={detailId}
              onClick={onConfirm}
            >
              {copy.confirm}
            </button>
          )}
          {state === 'unresolved' && (
            <button type="button" className={`button ${styles.cta}`} onClick={onRecheck}>
              <Icon name="retry" size={15} /> Check again
            </button>
          )}
          {(state === 'expired' || state === 'void') && onAskAgain && (
            <button type="button" className={`button ${styles.cta}`} onClick={onAskAgain}>
              <Icon name="retry" size={15} /> Ask again
            </button>
          )}
          {/* Announced by screen readers when it changes: confirmed, expired, replaced… */}
          <p className={`${styles.checkoutStatus} muted`} role="status">
            {state === 'live' &&
              (notDelivered ? 'Sofra could not be reached. Nothing was executed; you can confirm again.' : 'Only this button confirms.')}
            {state === 'held' && 'Available once the assistant has finished answering.'}
            {state === 'pending' && 'Available once the full answer has arrived.'}
            {inert?.text}
          </p>
        </div>
      </div>
    </section>
  );
}
