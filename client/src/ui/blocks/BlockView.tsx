import { memo } from 'react';
import { useChat, useChatStore, useServerNow, useServerToday } from '../../app/AppContext';
import type { Confirmation, Prompt } from '../../core/confirmation/machine';
import type { ParsedBlock } from '../../core/contract/parseBlock';
import type { Block, BlockOf, BlockType } from '../../core/contract/schemas';
import { Icon } from '../Icon';
import { ConfirmationCard, type CardState } from './ConfirmationCard';
import { CartSummary, ErrorBlock, MenuItem, OrderSummary, RestaurantCard, SuggestedActions } from './DataBlocks';
import { Markdown } from './Markdown';
import { VerificationGate } from './VerificationGate';
import styles from './blocks.module.css';

interface Context {
  /** This text block is still receiving deltas. */
  streaming: boolean;
  /** The user message that produced this response, to ask for a fresh confirmation. */
  askAgainText?: string | undefined;
}

/**
 * The single place where a server block turns into pixels.
 *
 * It takes what parseBlock returned and nothing else. Only the `valid` arm
 * reaches a component; an unknown type draws nothing; an invalid block draws a
 * calm notice and never its data.
 */
export const BlockView = memo(function BlockView({ slot, streaming, askAgainText }: { slot: ParsedBlock | null } & Context) {
  if (slot === null) return null;
  switch (slot.kind) {
    case 'unknown':
      // Not in the v1 catalog. Skipped without leaving a hole; the inspector lists it.
      return null;
    case 'invalid':
      return <InvalidBlock type={slot.type} />;
    case 'valid':
      return <ValidBlock block={slot.block} streaming={streaming} askAgainText={askAgainText} />;
  }
});

function ValidBlock({ block, streaming, askAgainText }: { block: Block } & Context) {
  const store = useChatStore();
  const today = useServerToday();
  switch (block.type) {
    case 'text':
      return <Markdown markdown={block.markdown} streaming={streaming} />;
    case 'restaurant_card':
      return <RestaurantCard block={block} />;
    case 'menu_item':
      return <MenuItem block={block} />;
    case 'cart_summary':
      return <CartSummary block={block} />;
    case 'order_summary':
      return <OrderSummary block={block} today={today} />;
    case 'confirmation_prompt':
      return <ConfirmationPrompt prompt={block} askAgainText={askAgainText} />;
    case 'verification_gate':
      return <VerificationGate block={block} />;
    case 'suggested_actions':
      return <SuggestedActions block={block} onChoose={(text) => store.getState().send(text)} />;
    case 'error':
      return <ErrorBlock block={block} />;
    default:
      // A block type added to the catalog without a renderer fails to compile here.
      return block satisfies never;
  }
}

export function InvalidBlock({ type }: { type: BlockType | null }) {
  if (type === 'confirmation_prompt') {
    return (
      <p className={styles.notice} role="note">
        <Icon name="alert" size={16} />
        <span>
          This answer contained a confirmation that could not be verified, so it cannot be used. Nothing was executed. Ask again to get a new one.
        </span>
      </p>
    );
  }
  return (
    <p className={styles.notice} role="note">
      <Icon name="info" size={16} />
      <span>One item in this answer could not be displayed.</span>
    </p>
  );
}

const cardState = (entry: Confirmation | undefined, answerInFlight: boolean, now: number | null): CardState => {
  if (!entry) return 'pending';
  if (entry.status.kind !== 'live') return entry.status.kind;
  // Shown as expired the moment the deadline passes, without waiting for the store's next tick.
  if (now !== null && now >= entry.expiresAtMs) return 'expired';
  return answerInFlight ? 'held' : 'live';
};

interface PromptProps {
  prompt: Prompt;
  /** The cart_summary sent just before this prompt in the same answer, if any. */
  cart?: BlockOf<'cart_summary'> | null | undefined;
  askAgainText?: string | undefined;
}

/** Connects a prompt to its entry in the confirmation registry. All it can do is call `confirm(token)`. */
export function ConfirmationPrompt({ prompt, cart = null, askAgainText }: PromptProps) {
  const store = useChatStore();
  const entry = useChat((state) => state.confirmations[prompt.confirm_token]);
  const answerInFlight = useChat((state) => state.activeTurnId !== null);
  const now = useServerNow();

  return (
    <ConfirmationCard
      prompt={prompt}
      cart={cart}
      state={cardState(entry, answerInFlight, now)}
      msLeft={now !== null ? Date.parse(prompt.expires_at) - now : null}
      notDelivered={entry?.notDelivered ?? false}
      onConfirm={() => store.getState().confirm(prompt.confirm_token)}
      onRecheck={() => store.getState().recheck(prompt.confirm_token)}
      onAskAgain={askAgainText ? () => store.getState().send(askAgainText) : undefined}
    />
  );
}
