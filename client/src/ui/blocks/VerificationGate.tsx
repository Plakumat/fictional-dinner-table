import type { BlockOf, GateRequirement } from '../../core/contract/schemas';
import { Icon } from '../Icon';
import styles from './blocks.module.css';

const REQUIREMENT: Record<GateRequirement, string> = {
  out_of_service_area: 'Outside the delivery area',
  item_unavailable: 'Item unavailable',
  age_18_plus: 'Age verification required',
  min_order: 'Below the minimum order',
  sufficient_funds: 'Not enough funds',
  not_cancellable: 'This order can no longer be cancelled',
  tip_window_expired: 'Tipping is closed for this order',
};

/**
 * An action that was stopped. Nothing was executed and nothing here can be
 * confirmed: the component has no button at all. `cta` is the way forward in
 * the server's words, shown as text.
 */
export function VerificationGate({ block }: { block: BlockOf<'verification_gate'> }) {
  return (
    <section className={styles.gate} aria-label="Blocked: nothing was executed">
      <p className={styles.kicker}>
        <Icon name="blocked" size={15} /> Blocked · nothing was executed
      </p>
      <h3 className={styles.title}>{REQUIREMENT[block.requirement]}</h3>
      <p>{block.reason}</p>
      <p className={styles.next}>
        <span className="muted">What you can do: </span>
        {block.cta}
      </p>
    </section>
  );
}
