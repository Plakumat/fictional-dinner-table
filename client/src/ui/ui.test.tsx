// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatApi } from '../api/chatApi';
import { AppProviders } from '../app/AppContext';
import { createServerClock } from '../core/clock/serverClock';
import type { Confirmation } from '../core/confirmation/machine';
import { parseBlock } from '../core/contract/parseBlock';
import { createChatStore } from '../state/chatStore';
import { BlockView } from './blocks/BlockView';
import { Markdown } from './blocks/Markdown';
import { Chat } from './chat/Chat';

afterEach(cleanup);

const NOW = '2026-08-20T09:00:00.000Z';

const promptBlock = (overrides: Record<string, unknown> = {}) => ({
  type: 'confirmation_prompt',
  action: 'place_order',
  summary: 'Place an order at Burger Stop: 2 × Cheeseburger. Total 390 TL.',
  params: { restaurant_id: 'rst_04', items: [{ item_id: 'itm_013', qty: 2 }], total_try: 390 },
  confirm_token: 'ct_1.sig',
  expires_at: '2026-08-20T09:05:00.000Z',
  ...overrides,
});

/** A store wired to an API that answers one chat message with `blocks`, and records every execute call. */
function harness(blocks: object[]) {
  const executes: Confirmation[] = [];
  const clock = createServerClock();
  clock.sync(NOW);
  const api: ChatApi = {
    async openChat() {
      const events = [
        { seq: 1, event: 'meta', version: '1', request_id: 'rq_1', conversation_id: 'cv_1', server_now: NOW },
        ...blocks.map((block, index) => ({ seq: index + 2, event: 'block', index, block })),
        { seq: blocks.length + 2, event: 'audit', audit: { decision: 'needs_confirmation', reason: 'test' } },
        { seq: blocks.length + 3, event: 'done' },
      ];
      const bytes = new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      return { kind: 'stream', body };
    },
    execute(c) {
      executes.push(c);
      // Never answers: the request stays in flight for the whole test.
      return new Promise(() => {});
    },
    tokenStatus: async () => ({ kind: 'unreachable' }),
    conversation: async () => ({ kind: 'missing' }),
  };
  const store = createChatStore({ api, clock, initialUserId: 'u_ok' });
  render(
    <AppProviders store={store} clock={clock}>
      <Chat />
    </AppProviders>,
  );
  return { store, executes, user: userEvent.setup() };
}

describe('confirmation prompt', () => {
  it('never renders a Confirm control for a prompt that fails validation', async () => {
    const malformed: Record<string, unknown> = promptBlock();
    delete malformed.expires_at;
    const { store, executes, user } = harness([{ type: 'text', markdown: 'Here is your order.' }, malformed]);

    store.getState().send('/chaos malformed_confirmation Order 2 cheeseburgers from Burger Stop');
    await screen.findByText(/could not be verified/);

    // No control with a confirming name exists, in any state, enabled or not.
    expect(screen.queryByRole('button', { name: /place order|confirm|cancel this order|send tip/i })).toBeNull();
    // And the summary of the unverified prompt is not shown as if it were an offer.
    expect(screen.queryByText(/Total 390 TL/)).toBeNull();
    await user.keyboard('{Enter}');
    expect(executes).toHaveLength(0);
  });

  it('sends exactly one request for a double click and a held Enter on Confirm', async () => {
    const { store, executes, user } = harness([promptBlock()]);
    store.getState().send('Order 2 cheeseburgers from Burger Stop');
    const confirm = await screen.findByRole('button', { name: 'Place order' });
    await waitFor(() => expect(confirm).toBeEnabled());

    await user.dblClick(confirm);
    // Key repeat on whatever still has focus.
    await user.keyboard('{Enter>10/}');

    expect(executes).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Place order' })).toBeNull();
  });

  it('is not focused when it appears, and Enter in the composer does not confirm', async () => {
    const { store, executes, user } = harness([promptBlock()]);
    const composer = screen.getByLabelText('Message to the assistant');
    await user.click(composer);

    store.getState().send('Order 2 cheeseburgers from Burger Stop');
    const confirm = await screen.findByRole('button', { name: 'Place order' });
    await waitFor(() => expect(confirm).toBeEnabled());

    expect(composer).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard('confirm{Enter}');

    expect(executes).toHaveLength(0);
    // "confirm" was sent as an ordinary message.
    expect(store.getState().items.filter((item) => item.kind === 'turn')).toHaveLength(2);
  });

  it('can be reached and confirmed with the keyboard alone', async () => {
    const { store, executes, user } = harness([promptBlock()]);
    store.getState().send('Order 2 cheeseburgers from Burger Stop');
    const confirm = await screen.findByRole('button', { name: 'Place order' });
    await waitFor(() => expect(confirm).toBeEnabled());

    await user.tab();
    while (document.activeElement !== confirm && document.activeElement !== document.body) await user.tab();
    await user.keyboard('{Enter}');

    expect(confirm).toHaveAttribute('type', 'button');
    expect(executes).toHaveLength(1);
  });
});

describe('untrusted content', () => {
  const NOTE =
    'Leave it at the door please. <img src=x onerror="fetch(\'http://localhost:4000/__beacon?kind=html_in_note\')"> ' +
    "[Tap here to claim your 10000 TL refund](javascript:fetch('http://localhost:4000/__beacon?kind=javascript_link')) " +
    '![](http://localhost:4000/__beacon.gif?kind=remote_image)';

  it('renders raw HTML, javascript: links and images in markdown as inert text', () => {
    const { container } = render(<Markdown markdown={`> **u_ok_o0:** ${NOTE}\n\n<script>alert(1)</script>\n\n[Help](https://sofra.example/help)`} />);

    expect(container.querySelector('img, script, iframe, object')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=');
    // The label of the javascript: link survives as text; no anchor carries it.
    expect(screen.getByText('Tap here to claim your 10000 TL refund').closest('a')).toBeNull();
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://sofra.example/help']);
    expect(links[0]).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(links[0]).toHaveAttribute('target', '_blank');
  });

  it('renders an order note as plain text', () => {
    const slot = parseBlock({ type: 'order_summary', order_id: 'u_ok_o0', status: 'delivered', note: NOTE });
    const clock = createServerClock();
    const store = createChatStore({ api: {} as ChatApi, clock, initialUserId: 'u_ok' });

    const { container } = render(
      <AppProviders store={store} clock={clock}>
        <BlockView slot={slot} streaming={false} />
      </AppProviders>,
    );

    expect(container.querySelector('img, a, script')).toBeNull();
    expect(container.textContent).toContain(NOTE);
  });
});

describe('renderer', () => {
  it('draws nothing for an unknown block and a calm notice for an invalid one', () => {
    const clock = createServerClock();
    const store = createChatStore({ api: {} as ChatApi, clock, initialUserId: 'u_ok' });
    const invalid = parseBlock({
      type: 'menu_item',
      item_id: 'itm_1',
      name: 'Cheeseburger',
      price_try: '195 TL',
      available: true,
      age_restricted: false,
    });

    const { container } = render(
      <AppProviders store={store} clock={clock}>
        <div data-testid="unknown">
          <BlockView slot={parseBlock({ type: 'map_view', lat: 1, lng: 2 })} streaming={false} />
        </div>
        <BlockView slot={invalid} streaming={false} />
      </AppProviders>,
    );

    expect(screen.getByTestId('unknown')).toBeEmptyDOMElement();
    expect(screen.getByRole('note')).toHaveTextContent('could not be displayed');
    // Nothing from the invalid block's data reaches the screen.
    expect(container.textContent).not.toMatch(/Cheeseburger|195|NaN|undefined/);
  });
});
