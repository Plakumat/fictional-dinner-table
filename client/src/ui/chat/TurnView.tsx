import { memo, useEffect, useState } from 'react';
import { useChat, useChatStore } from '../../app/AppContext';
import type { Prompt } from '../../core/confirmation/machine';
import type { ParsedBlock } from '../../core/contract/parseBlock';
import type { Block, BlockOf, Decision } from '../../core/contract/schemas';
import { isOpen, type Phase, type ResponseState } from '../../core/stream/response';
import type { TranscriptItem } from '../../state/chatStore';
import { BlockView, ConfirmationPrompt } from '../blocks/BlockView';
import { MenuCard, RestaurantRow } from '../blocks/DataBlocks';
import { Logo } from '../food/icons';
import { Icon, type IconName } from '../Icon';
import { Citations } from '../sources/Citations';
import styles from './chat.module.css';

interface Props {
  item: TranscriptItem;
  /** Only the last item of the transcript can be retried. */
  isLast: boolean;
}

export const TurnView = memo(function TurnView({ item, isLast }: Props) {
  if (item.kind === 'action_result') {
    const executed = item.httpStatus === 200 || item.httpStatus === null;
    return (
      <li className={styles.turn}>
        <p className={styles.resultLabel}>
          <Icon name={executed ? 'check' : 'info'} size={14} />
          {executed ? 'Result of your confirmation' : 'Your confirmation was not carried out'}
        </p>
        <Answer response={item.response} />
      </li>
    );
  }
  return (
    <li className={styles.turn}>
      <p className={styles.user}>
        <span className="visually-hidden">You said: </span>
        {item.userText}
      </p>
      <Answer response={item.response} userText={item.userText} retryTurnId={isLast ? item.id : undefined} />
    </li>
  );
});

/**
 * Blocks arrive one by one; some of them belong together on screen:
 * - a run of restaurant_cards is one row of cards;
 * - a run of menu_items is one menu, grouped by category;
 * - a cart_summary right before a confirmation_prompt is the checkout card.
 * Everything else is drawn by BlockView, one block at a time.
 */
type Group =
  | { kind: 'one'; index: number; slot: ParsedBlock }
  | { kind: 'restaurants'; items: BlockOf<'restaurant_card'>[] }
  | { kind: 'menu'; items: BlockOf<'menu_item'>[] }
  | { kind: 'checkout'; cart: BlockOf<'cart_summary'> | null; prompt: Prompt };

const validBlock = (slot: ParsedBlock | null | undefined): Block | null => (slot?.kind === 'valid' ? slot.block : null);

function groupBlocks(blocks: readonly (ParsedBlock | null)[]): Group[] {
  const groups: Group[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const slot = blocks[i];
    if (!slot) continue;
    const block = validBlock(slot);
    if (block?.type === 'restaurant_card') {
      const items = [block];
      while (validBlock(blocks[i + 1])?.type === 'restaurant_card') items.push(validBlock(blocks[++i]) as BlockOf<'restaurant_card'>);
      groups.push({ kind: 'restaurants', items });
    } else if (block?.type === 'menu_item') {
      const items = [block];
      while (validBlock(blocks[i + 1])?.type === 'menu_item') items.push(validBlock(blocks[++i]) as BlockOf<'menu_item'>);
      groups.push({ kind: 'menu', items });
    } else if (block?.type === 'cart_summary' && validBlock(blocks[i + 1])?.type === 'confirmation_prompt') {
      groups.push({ kind: 'checkout', cart: block, prompt: validBlock(blocks[++i]) as Prompt });
    } else if (block?.type === 'confirmation_prompt') {
      groups.push({ kind: 'checkout', cart: null, prompt: block });
    } else {
      groups.push({ kind: 'one', index: i, slot });
    }
  }
  return groups;
}

function Answer({ response, userText, retryTurnId }: { response: ResponseState; userText?: string; retryTurnId?: string | undefined }) {
  const { phase, blocks, audit } = response;
  const open = isOpen(phase);
  const unfinished = !open && phase.kind !== 'complete';
  const decision = audit?.kind === 'valid' ? audit.audit.decision : null;
  const sources = audit?.kind === 'valid' ? (audit.audit.kb_doc_ids ?? []) : [];
  // "Show the Burger Stop menu": the request names the restaurant a menu belongs to. The blocks do not.
  const restaurant = userText ? /show the (.+?) menu/i.exec(userText)?.[1] : undefined;
  const groups = groupBlocks(blocks);

  return (
    <div className={styles.answer}>
      <span className={styles.avatar} aria-hidden="true">
        <Logo size={16} />
      </span>
      <div className={styles.assistant} data-phase={phase.kind} data-unfinished={unfinished}>
        {groups.map((group, i) => {
          switch (group.kind) {
            case 'restaurants':
              return <RestaurantRow key={i} items={group.items} />;
            case 'menu':
              return <MenuCard key={i} items={group.items} restaurant={restaurant} />;
            case 'checkout':
              return <ConfirmationPrompt key={i} prompt={group.prompt} cart={group.cart} askAgainText={userText} />;
            case 'one':
              // Position is identity: a block's index is its place in the document.
              return <BlockView key={group.index} slot={group.slot} streaming={open && group.index === blocks.length - 1} askAgainText={userText} />;
          }
        })}
        {decision && <DecisionNote decision={decision} />}
        {sources.length > 0 && <Citations docIds={sources} />}
        <PhaseStatus phase={phase} retryTurnId={retryTurnId} />
      </div>
    </div>
  );
}

/**
 * How much of the audit record the product shows.
 *
 * `blocked` and `needs_confirmation` already have a block that says so (the
 * gate, the prompt), and `answered` needs no comment. The other three change
 * how the user should read the text above them, and nothing else on screen
 * carries that: "I don't know" must not look like an answer.
 */
const DECISION_NOTE: Partial<Record<Decision, { icon: IconName; text: string }>> = {
  clarify: { icon: 'question', text: 'The assistant needs more information before it can go on.' },
  unknown: { icon: 'info', text: "The assistant doesn't know this, and did not guess." },
  refused: { icon: 'blocked', text: 'The assistant declined this request.' },
};

function DecisionNote({ decision }: { decision: Decision }) {
  const note = DECISION_NOTE[decision];
  if (!note) return null;
  return (
    <p className={styles.note} data-decision={decision}>
      <Icon name={note.icon} size={15} />
      {note.text}
    </p>
  );
}

export interface PhaseCopy {
  icon: IconName;
  text: string;
  retry: boolean;
}

export function describePhase(phase: Phase, secondsToRetry: number): PhaseCopy | null {
  switch (phase.kind) {
    case 'connecting':
      return { icon: 'clock', text: 'Sofra is thinking…', retry: false };
    case 'streaming':
      return { icon: 'clock', text: 'Answering…', retry: false };
    case 'complete':
      return null;
    case 'incomplete':
      return {
        icon: 'alert',
        text:
          phase.reason === 'corrupt_stream'
            ? 'Incomplete: this answer arrived damaged and was cut short.'
            : 'Incomplete: the connection was lost before this answer finished.',
        retry: true,
      };
    case 'stopped':
      return {
        icon: 'stop',
        text:
          phase.by === 'user' ? 'Stopped by you. This answer is incomplete.' : 'Stopped because you sent a new message. This answer is incomplete.',
        retry: phase.by === 'user',
      };
    case 'unsupported_version':
      return {
        icon: 'alert',
        text: `This answer uses a newer format (version ${phase.version}) that this app cannot display, so nothing is shown. Updating the app should fix it.`,
        retry: false,
      };
    case 'failed':
      if (phase.retryNotBeforeMs !== undefined) {
        return {
          icon: 'clock',
          text:
            secondsToRetry > 0
              ? `Sofra is receiving too many requests. You can try again in ${secondsToRetry} s.`
              : 'Sofra was receiving too many requests. You can try again now.',
          retry: true,
        };
      }
      if (phase.httpStatus !== undefined) {
        return {
          icon: 'alert',
          text: 'Sofra could not answer: this attempt failed and will not recover on its own. Nothing was changed. You can send it again.',
          retry: true,
        };
      }
      if (phase.code === 'network_error') {
        return { icon: 'alert', text: 'Could not reach Sofra. Check your connection, then try again.', retry: true };
      }
      return {
        icon: 'alert',
        text: `The answer stopped with an error: ${phase.message}${phase.retryable ? '' : ' Trying again will not help.'}`,
        retry: phase.retryable,
      };
  }
}

/** Seconds until `deadlineMs` on the local monotonic timer, re-evaluated while it is in the future. */
export function useSecondsUntil(deadlineMs: number | undefined): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (deadlineMs === undefined) return;
    const update = () => {
      const left = Math.max(0, Math.ceil((deadlineMs - performance.now()) / 1000));
      setSeconds(left);
      return left;
    };
    if (update() === 0) return;
    const id = setInterval(() => {
      if (update() === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [deadlineMs]);
  return seconds;
}

/**
 * The line under every response. It is always there, with a fixed height, so
 * the transcript does not move when a response settles. Every async state has
 * words here; none of them is a blank area or a bare spinner.
 */
function PhaseStatus({ phase, retryTurnId }: { phase: Phase; retryTurnId?: string | undefined }) {
  const store = useChatStore();
  const idle = useChat((state) => state.activeTurnId === null);
  const secondsToRetry = useSecondsUntil(phase.kind === 'failed' ? phase.retryNotBeforeMs : undefined);
  const copy = describePhase(phase, secondsToRetry);

  return (
    <div className={styles.status} data-open={isOpen(phase)}>
      {copy && (
        <p className={styles.statusText}>
          <Icon name={copy.icon} size={15} />
          {copy.text}
        </p>
      )}
      {copy?.retry && retryTurnId && (
        <button type="button" className="button" disabled={!idle || secondsToRetry > 0} onClick={() => store.getState().retry(retryTurnId)}>
          <Icon name="retry" size={15} /> Try again
        </button>
      )}
    </div>
  );
}
