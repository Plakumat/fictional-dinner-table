import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChatApi } from '../api/chatApi';
import { AppProviders } from '../app/AppContext';
import type { Prompt } from '../core/confirmation/machine';
import { createServerClock } from '../core/clock/serverClock';
import { parseBlock } from '../core/contract/parseBlock';
import { initialResponse, type Phase, type ResponseState } from '../core/stream/response';
import { BLOCK_FIXTURES } from '../fixtures/blocks';
import { createChatStore, type Turn } from '../state/chatStore';
import { BlockView } from '../ui/blocks/BlockView';
import { ConfirmationCard, type CardState } from '../ui/blocks/ConfirmationCard';
import { TurnView } from '../ui/chat/TurnView';
import '../ui/styles/global.css';
import styles from './workbench.module.css';

// Every block in every state, on one page, with no backend.
//
// This is a separate Vite entry (workbench.html), not a route: it needs no
// router and it is not part of the application's production bundle. It renders
// the real components through the real parseBlock, from the same fixtures the
// contract test uses, so what is shown here is what the app would draw.

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

const parsed = (name: string) => parseBlock(BLOCK_FIXTURES.find((f) => f.name === name)!.block);

const promptOf = (name: string): Prompt => {
  const slot = parsed(name);
  if (slot.kind !== 'valid' || slot.block.type !== 'confirmation_prompt') throw new Error(`${name} is not a valid prompt`);
  return slot.block;
};

const CARD_STATES: { state: CardState; msLeft: number | null; note: string; notDelivered?: boolean }[] = [
  { state: 'pending', msLeft: 298_000, note: 'On screen, but its response has not finished' },
  { state: 'live', msLeft: 298_000, note: 'Can be confirmed' },
  { state: 'live', msLeft: 18_000, note: 'Less than 30 s left' },
  { state: 'live', msLeft: 240_000, notDelivered: true, note: 'A request provably never reached the server' },
  { state: 'held', msLeft: 250_000, note: 'Another answer is streaming and may replace it' },
  { state: 'confirming', msLeft: 250_000, note: 'One execute request in flight' },
  { state: 'reconciling', msLeft: null, note: 'The request died; asking the status endpoint' },
  { state: 'unresolved', msLeft: null, note: 'The status endpoint could not be reached' },
  { state: 'confirmed', msLeft: null, note: 'Executed' },
  { state: 'expired', msLeft: null, note: 'Deadline passed on the server clock, or a 410' },
  { state: 'superseded', msLeft: null, note: 'A newer prompt for the same action arrived' },
  { state: 'rejected', msLeft: null, note: 'The server refused: a closed gate, an invalid token' },
  { state: 'void', msLeft: null, note: 'Its response never finished' },
];

const response = (phase: Phase, blocks: ResponseState['blocks'] = [parsed('text')]): ResponseState => ({ ...initialResponse(), phase, blocks });

const PHASES: { note: string; response: ResponseState }[] = [
  { note: 'connecting', response: response({ kind: 'connecting' }, []) },
  { note: 'streaming', response: response({ kind: 'streaming' }, [parseBlock({ type: 'text', markdown: "Here's your cart from **Bur" })]) },
  { note: 'complete', response: response({ kind: 'complete' }) },
  { note: 'stopped by the user', response: response({ kind: 'stopped', by: 'user' }) },
  { note: 'incomplete: closed without done', response: response({ kind: 'incomplete', reason: 'closed_without_done' }) },
  {
    note: 'failed, retryable (error event)',
    response: response({ kind: 'failed', code: 'upstream_timeout', message: 'The assistant took too long to respond.', retryable: true }),
  },
  {
    note: 'failed, final (HTTP 500)',
    response: response({ kind: 'failed', code: 'internal', message: 'Something went wrong on our side.', retryable: true, httpStatus: 500 }, []),
  },
  {
    note: 'rate limited (HTTP 429)',
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
  { note: 'unsupported version', response: response({ kind: 'unsupported_version', version: '2' }, []) },
];

const turn = (id: string, r: ResponseState): Turn => ({ kind: 'turn', id, userText: 'What is in my cart?', response: r });

function Workbench() {
  const noop = () => {};
  return (
    <main className={styles.page}>
      <h1>Component workbench</h1>
      <p className="muted">Every block in every state. Server time is frozen at {NOW}.</p>

      <h2>The four that must never be confused</h2>
      <p className="muted">Blocked, waiting for you, done, error: told apart by border, icon and first words, not by colour.</p>
      <div className={styles.four}>
        <BlockView slot={parsed('verification_gate')} streaming={false} />
        <ConfirmationCard prompt={promptOf('confirmation_prompt, place_order')} state="live" msLeft={298_000} onConfirm={noop} onRecheck={noop} />
        <BlockView slot={parsed('order_summary, delivered')} streaming={false} />
        <BlockView slot={parsed('error')} streaming={false} />
      </div>

      <h2>Confirmation prompt: every state</h2>
      <div className={styles.grid}>
        {CARD_STATES.map(({ state, msLeft, note, notDelivered }, i) => (
          <Sample key={i} label={state} note={note}>
            <ConfirmationCard
              prompt={promptOf('confirmation_prompt, place_order')}
              state={state}
              msLeft={msLeft}
              notDelivered={notDelivered ?? false}
              onConfirm={noop}
              onRecheck={noop}
              onAskAgain={noop}
            />
          </Sample>
        ))}
        <Sample label="live, destructive" note="cancel_order reads as destructive">
          <ConfirmationCard prompt={promptOf('confirmation_prompt, cancel_order')} state="live" msLeft={298_000} onConfirm={noop} onRecheck={noop} />
        </Sample>
        <Sample label="live, tip" note="add_tip">
          <ConfirmationCard prompt={promptOf('confirmation_prompt, add_tip')} state="live" msLeft={298_000} onConfirm={noop} onRecheck={noop} />
        </Sample>
      </div>

      <h2>Every fixture through parseBlock</h2>
      <div className={styles.grid}>
        {BLOCK_FIXTURES.map((fixture) => (
          <Sample
            key={fixture.name}
            label={fixture.name}
            note={`parseBlock → ${fixture.expect}${fixture.expect === 'unknown' ? ' (draws nothing)' : ''}`}
          >
            <BlockView slot={parseBlock(fixture.block)} streaming={false} />
          </Sample>
        ))}
      </div>

      <h2>Response phases</h2>
      <ol className={styles.grid}>
        {PHASES.map(({ note, response: r }, i) => (
          <Sample key={note} label={note} note="">
            <ol>
              <TurnView item={turn(`phase_${i}`, r)} isLast />
            </ol>
          </Sample>
        ))}
      </ol>
    </main>
  );
}

function Sample({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <section className={styles.sample}>
      <p className={styles.label}>
        <span className="mono">{label}</span>
        {note && <span className="muted"> · {note}</span>}
      </p>
      {children}
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
