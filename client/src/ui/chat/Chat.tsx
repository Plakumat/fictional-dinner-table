import { useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useChat, useChatStore } from '../../app/AppContext';
import { isOpen } from '../../core/stream/response';
import { Icon } from '../Icon';
import { describeResponse } from './announce';
import { TurnView } from './TurnView';
import styles from './chat.module.css';

/** Close enough to the bottom that new content should keep the view pinned there. */
const PIN_DISTANCE = 80;

/**
 * The assistant: the transcript (or, while it is empty, whatever `empty`
 * shows in its place) above the composer.
 */
export function Chat({ empty }: { empty?: ReactNode }) {
  const hasItems = useChat((state) => state.items.length > 0);
  return (
    <section className={styles.chat} aria-label="Assistant">
      {hasItems || !empty ? <Transcript /> : <div className={styles.scroll}>{empty}</div>}
      <Composer />
    </section>
  );
}

function Transcript() {
  const items = useChat((state) => state.items);
  const restoring = useChat((state) => state.restoring);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the answer as it streams, unless the user has scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  return (
    <div
      ref={scroller}
      className={`${styles.scroll} ${styles.transcript}`}
      tabIndex={0}
      role="region"
      aria-label="Conversation"
      onScroll={(event) => {
        const el = event.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_DISTANCE;
      }}
    >
      {items.length === 0 ? (
        <p className={`${styles.empty} muted`}>
          {restoring ? 'Restoring your conversation…' : 'Ask Sofra anything about restaurants, your cart or your orders.'}
        </p>
      ) : (
        <ol className={styles.turns} aria-label="Messages">
          {items.map((item, index) => (
            <TurnView key={item.id} item={item} isLast={index === items.length - 1} />
          ))}
        </ol>
      )}
      <Announcer />
    </div>
  );
}

/** Says each response once, when it has settled. See announce.ts. */
function Announcer() {
  const last = useChat((state) => state.items.at(-1));
  // Empty while a response is streaming; filled once, when it settles. The
  // change from empty to text is what the live region announces.
  const message = useMemo(() => (last && !isOpen(last.response.phase) ? describeResponse(last.response) : ''), [last]);

  return (
    <p className="visually-hidden" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

function Composer() {
  const store = useChatStore();
  const streaming = useChat((state) => state.activeTurnId !== null);
  const [text, setText] = useState('');

  // Controlled on purpose. React 19 form actions were tried here: the form's
  // automatic reset runs a beat after the action, and text typed in that beat
  // is wiped. A controlled value clears exactly when the message is sent.
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (text.trim() === '') return;
    // Sending is all this form can do. It has no path to `confirm`: typing
    // "confirm" and pressing Enter sends a message, like any other text.
    store.getState().send(text);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    // A held key repeats. One press, one message.
    if (!event.repeat) submit();
  };

  return (
    <div className={styles.composerWrap}>
      <form className={styles.composer} onSubmit={submit}>
        <label htmlFor="composer-input" className="visually-hidden">
          Message to the assistant
        </label>
        <textarea
          id="composer-input"
          className={styles.input}
          rows={1}
          value={text}
          placeholder="Ask Sofra… “Order 2 cheeseburgers from Burger Stop”"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {/* Always present, so the row does not shift when a stream starts or ends. */}
        <button type="button" className={styles.iconButton} aria-label="Stop" disabled={!streaming} onClick={() => store.getState().stop()}>
          <Icon name="stop" size={16} />
        </button>
        <button type="submit" className={`${styles.iconButton} ${styles.send}`} aria-label="Send" disabled={text.trim() === ''}>
          <Icon name="send" size={18} />
        </button>
      </form>
      <p className={styles.composerHint}>
        Enter sends, Shift+Enter makes a new line. Anything that spends money waits for your confirmation on a card.
      </p>
    </div>
  );
}
