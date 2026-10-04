import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChatApi } from '../api/chatApi';
import { AppProviders } from '../app/AppContext';
import type { Prompt } from '../core/confirmation/machine';
import { createServerClock } from '../core/clock/serverClock';
import { parseBlock } from '../core/contract/parseBlock';
import type { BlockType } from '../core/contract/schemas';
import { initialResponse, type Phase, type ResponseState } from '../core/stream/response';
import { BLOCK_FIXTURES, type BlockFixture } from '../fixtures/blocks';
import { createChatStore, type Turn } from '../state/chatStore';
import { BlockView } from '../ui/blocks/BlockView';
import { ConfirmationCard, type CardState } from '../ui/blocks/ConfirmationCard';
import { TurnView } from '../ui/chat/TurnView';
import { Logo } from '../ui/food/icons';
import '../ui/styles/global.css';
import styles from './workbench.module.css';

// Every card in every state, on one page, with no backend.
//
// This is a separate Vite entry (workbench.html), not a route: it needs no
// router and it is not part of the application's production bundle. It renders
// the real components through the real parseBlock, from the same fixtures the
// contract test uses, so what is shown here is what the app would draw.
// Nothing on this page is hand-written markup; it is all the app's components.

const NOW = '2026-08-20T09:00:00.000Z';
const clock = createServerClock(() => 0);
clock.sync(NOW);

// Nothing here talks to a server. Buttons are live but lead nowhere.
const offline: ChatApi = {
  openChat: async () => ({ kind: 'http_error', status: 503, code: 'workbench', message: 'The workbench has no backend.', retryAfterS: null }),
  execute: async () => ({ kind: 'no_response' }),
  tokenStatus: async () => ({ kind: 'unreachable' }),
  conversation: async () => ({ kind: 'missing' }),
};
const store = createChatStore({ api: offline, clock, initialUserId: 'u_ok' });

const fixture = (name: string): BlockFixture => BLOCK_FIXTURES.find((f) => f.name === name)!;
const parsed = (name: string) => parseBlock(fixture(name).block);

const promptOf = (name: string): Prompt => {
  const slot = parsed(name);
  if (slot.kind !== 'valid' || slot.block.type !== 'confirmation_prompt') throw new Error(`${name} is not a valid prompt`);
  return slot.block;
};

const cartOf = (name: string) => {
  const slot = parsed(name);
  return slot.kind === 'valid' && slot.block.type === 'cart_summary' ? slot.block : null;
};

// ------------------------------------------------------------ plain words

const TYPE_NAMES: Record<BlockType, string> = {
  text: 'Text from the assistant',
  restaurant_card: 'Restaurant card',
  menu_item: 'Menu item',
  cart_summary: 'Cart',
  order_summary: 'Order',
  confirmation_prompt: 'Confirmation (checkout)',
  verification_gate: 'Blocked',
  suggested_actions: 'Suggested replies',
  error: 'Error',
};

const OUTCOME = {
  valid: { label: 'Valid', detail: 'Drawn as sent.' },
  invalid: { label: 'Invalid', detail: 'Not drawn; a calm notice takes its place. The details go to the audit inspector.' },
  unknown: { label: 'Unknown type', detail: 'Not in the catalog: nothing is drawn, nothing breaks.' },
} as const;

const CARD_STATES: { state: CardState; msLeft: number | null; title: string; when: string; notDelivered?: boolean }[] = [
  {
    state: 'pending',
    msLeft: 298_000,
    title: 'Waiting for the full answer',
    when: 'The card is on screen but the answer it belongs to has not finished streaming.',
  },
  { state: 'live', msLeft: 298_000, title: 'Live', when: 'The user can confirm. The countdown runs on the server’s clock.' },
  { state: 'live', msLeft: 18_000, title: 'Live, about to expire', when: 'Under 30 seconds left: the countdown changes its wording and icon.' },
  {
    state: 'live',
    msLeft: 240_000,
    notDelivered: true,
    title: 'Live again after a lost request',
    when: 'A request never reached the server, so nothing ran; the card says so.',
  },
  { state: 'held', msLeft: 250_000, title: 'Held', when: 'Another answer is streaming and may replace this card; confirming waits.' },
  { state: 'confirming', msLeft: 250_000, title: 'Confirming', when: 'One request is on its way. A second click does nothing.' },
  { state: 'reconciling', msLeft: null, title: 'Checking the outcome', when: 'The connection dropped; the client asks the server what happened.' },
  {
    state: 'unresolved',
    msLeft: null,
    title: 'Outcome unknown',
    when: 'The server could not be reached to ask. The user can ask again, not approve again.',
  },
  { state: 'confirmed', msLeft: null, title: 'Confirmed', when: 'Executed once. The result appears below the card.' },
  { state: 'expired', msLeft: null, title: 'Expired', when: 'The deadline passed. Nothing was executed; a fresh confirmation can be requested.' },
  { state: 'superseded', msLeft: null, title: 'Replaced', when: 'A newer confirmation for the same action arrived.' },
  {
    state: 'rejected',
    msLeft: null,
    title: 'Refused by the server',
    when: 'A gate closed or the token was not accepted. The server’s answer is shown below.',
  },
  { state: 'void', msLeft: null, title: 'No longer valid', when: 'The answer never finished, or the conversation changed.' },
];

const response = (phase: Phase, blocks: ResponseState['blocks'] = [parsed('text')]): ResponseState => ({ ...initialResponse(), phase, blocks });

const PHASES: { title: string; when: string; response: ResponseState }[] = [
  { title: 'Thinking', when: 'The request was sent; nothing has arrived yet.', response: response({ kind: 'connecting' }, []) },
  {
    title: 'Answering',
    when: 'Text is streaming in. Half-finished markdown is steadied so it does not flicker.',
    response: response({ kind: 'streaming' }, [parseBlock({ type: 'text', markdown: "Here's your cart from **Bur" })]),
  },
  { title: 'Complete', when: 'The answer finished.', response: response({ kind: 'complete' }) },
  { title: 'Stopped by the user', when: 'What arrived stays, marked as incomplete.', response: response({ kind: 'stopped', by: 'user' }) },
  {
    title: 'Connection lost',
    when: 'The stream ended before the answer did. Retry is offered.',
    response: response({ kind: 'incomplete', reason: 'closed_without_done' }),
  },
  {
    title: 'Error from the assistant',
    when: 'The server gave up and said a retry may help.',
    response: response({ kind: 'failed', code: 'upstream_timeout', message: 'The assistant took too long to respond.', retryable: true }),
  },
  {
    title: 'Failed for good',
    when: 'An HTTP error instead of an answer. Said plainly; retry allowed.',
    response: response({ kind: 'failed', code: 'internal', message: 'Something went wrong on our side.', retryable: true, httpStatus: 500 }, []),
  },
  {
    title: 'Too many requests',
    when: 'Retry is not possible before the server’s waiting time has passed.',
    response: response(
      {
        kind: 'failed',
        code: 'rate_limited',
        message: 'Too many requests.',
        retryable: true,
        httpStatus: 429,
        retryNotBeforeMs: performance.now() + 60_000,
      },
      [],
    ),
  },
  {
    title: 'Unsupported format',
    when: 'The answer declared a version this app does not know. Nothing is drawn.',
    response: response({ kind: 'unsupported_version', version: '2' }, []),
  },
];

const turn = (id: string, r: ResponseState): Turn => ({ kind: 'turn', id, userText: 'What is in my cart?', response: r });

// ------------------------------------------------------------ page

const SECTIONS = [
  ['four', 'The four states'],
  ['confirmation', 'Confirmation card'],
  ['blocks', 'Every card'],
  ['answers', 'Answer states'],
] as const;

function Workbench() {
  const noop = () => {};
  const byType = Object.keys(TYPE_NAMES) as BlockType[];
  const typeOf = (f: BlockFixture) => (f.block as { type?: string }).type ?? '';
  const describe = (f: BlockFixture) => {
    const rest = f.name
      .replace(typeOf(f), '')
      .replace(/^[,\s]+/, '')
      .replace(/^\((.*)\)$/, '$1');
    return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : 'Typical example';
  };
  const unknownFixtures = BLOCK_FIXTURES.filter((f) => f.expect === 'unknown');

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <Logo size={28} /> Sofra · component workbench
        </div>
        <nav className={styles.sectionNav} aria-label="Sections">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main className={styles.content}>
        <section className={styles.intro}>
          <h1>Every card the assistant can send, in every state it can be in</h1>
          <p>
            Sofra answers with cards, not free text. This page shows each kind of card, what it looks like when something is wrong with it, and every
            state a confirmation can go through. The cards are the real ones from the application, drawn from the same examples the automated tests
            check. The server time is frozen at 12:00 on 20 August 2026.
          </p>
        </section>

        <section id="four" className={styles.section} aria-labelledby="four-h">
          <h2 id="four-h">The four states that must never be confused</h2>
          <p className={styles.lede}>
            Blocked, waiting for you, done, error. They are told apart by their shape, their icon and their first words, never by colour alone.
          </p>
          <div className={styles.four}>
            <Frame title="Blocked" when="The action was stopped. Nothing was executed and there is no button.">
              <BlockView slot={parsed('verification_gate')} streaming={false} />
            </Frame>
            <Frame title="Waiting for you" when="Needs a decision. The one button that moves money.">
              <ConfirmationCard
                prompt={promptOf('confirmation_prompt, place_order')}
                cart={cartOf('cart_summary')}
                state="live"
                msLeft={298_000}
                onConfirm={noop}
                onRecheck={noop}
              />
            </Frame>
            <Frame title="Done" when="A completed order. A receipt, not a question.">
              <BlockView slot={parsed('order_summary, delivered')} streaming={false} />
            </Frame>
            <Frame title="Error" when="Something went wrong on the assistant’s side.">
              <BlockView slot={parsed('error')} streaming={false} />
            </Frame>
          </div>
        </section>

        <section id="confirmation" className={styles.section} aria-labelledby="confirmation-h">
          <h2 id="confirmation-h">The confirmation card, state by state</h2>
          <p className={styles.lede}>One card, thirteen states. Only in “Live” can money move, and only once.</p>
          <div className={styles.grid}>
            {CARD_STATES.map(({ state, msLeft, title, when, notDelivered }, i) => (
              <Frame key={i} title={title} when={when} code={state}>
                <ConfirmationCard
                  prompt={promptOf('confirmation_prompt, place_order')}
                  cart={cartOf('cart_summary')}
                  state={state}
                  msLeft={msLeft}
                  notDelivered={notDelivered ?? false}
                  onConfirm={noop}
                  onRecheck={noop}
                  onAskAgain={noop}
                />
              </Frame>
            ))}
            <Frame title="Cancelling an order" when="A destructive action reads as one: a warning in words and an outlined button.">
              <ConfirmationCard
                prompt={promptOf('confirmation_prompt, cancel_order')}
                state="live"
                msLeft={298_000}
                onConfirm={noop}
                onRecheck={noop}
              />
            </Frame>
            <Frame title="Sending a tip" when="The same card for a tip.">
              <ConfirmationCard prompt={promptOf('confirmation_prompt, add_tip')} state="live" msLeft={298_000} onConfirm={noop} onRecheck={noop} />
            </Frame>
          </div>
        </section>

        <section id="blocks" className={styles.section} aria-labelledby="blocks-h">
          <h2 id="blocks-h">Every card, valid and broken</h2>
          <p className={styles.lede}>
            Everything the server sends is checked before it is drawn. A valid card is drawn as sent; a broken one is never drawn with wrong data.
          </p>
          {byType.map((type) => {
            const ofType = BLOCK_FIXTURES.filter((f) => typeOf(f) === type);
            if (ofType.length === 0) return null;
            return (
              <div key={type} className={styles.group}>
                <h3>{TYPE_NAMES[type]}</h3>
                <div className={styles.grid}>
                  {ofType.map((f) => (
                    <Frame key={f.name} title={describe(f)} when={OUTCOME[f.expect].detail} outcome={OUTCOME[f.expect].label} outcomeKind={f.expect}>
                      <BlockView slot={parseBlock(f.block)} streaming={false} />
                    </Frame>
                  ))}
                </div>
              </div>
            );
          })}
          <div className={styles.group}>
            <h3>Cards the app does not know</h3>
            <div className={styles.grid}>
              {unknownFixtures.map((f) => (
                <Frame key={f.name} title={describe(f)} when={OUTCOME.unknown.detail} outcome={OUTCOME.unknown.label} outcomeKind="unknown">
                  <BlockView slot={parseBlock(f.block)} streaming={false} />
                  <p className={styles.empty}>(nothing is drawn here, on purpose)</p>
                </Frame>
              ))}
            </div>
          </div>
        </section>

        <section id="answers" className={styles.section} aria-labelledby="answers-h">
          <h2 id="answers-h">What an answer looks like while it is on its way, and when it is not</h2>
          <p className={styles.lede}>Every waiting state has words. None of them is a blank area or a spinner that never ends.</p>
          <div className={styles.list}>
            {PHASES.map(({ title, when, response: r }, i) => (
              <Frame key={title} title={title} when={when} code={r.phase.kind}>
                <ol>
                  <TurnView item={turn(`phase_${i}`, r)} isLast />
                </ol>
              </Frame>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Frame({
  title,
  when,
  code,
  outcome,
  outcomeKind,
  children,
}: {
  title: string;
  when: string;
  code?: string;
  outcome?: string;
  outcomeKind?: 'valid' | 'invalid' | 'unknown';
  children: ReactNode;
}) {
  return (
    <section className={styles.frame} aria-label={title}>
      <header className={styles.frameHead}>
        <div>
          <p className={styles.frameTitle}>
            {title}
            {outcome && (
              <span className={styles.outcome} data-kind={outcomeKind}>
                {outcome}
              </span>
            )}
          </p>
          <p className={styles.frameWhen}>{when}</p>
        </div>
        {code && <code className={styles.frameCode}>{code}</code>}
      </header>
      <div className={styles.frameBody}>{children}</div>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders store={store} clock={clock}>
      <Workbench />
    </AppProviders>
  </StrictMode>,
);
