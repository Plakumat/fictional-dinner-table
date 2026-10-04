# Architecture decisions

The decisions behind the client, each with the reason and the alternative that
was turned down. `README.md` tells the story; this page is the ledger. Where a
decision is dangerous (money, security), `client/src/core/README.md` names the
file it lives in and the test that pins it.

The brief's own question for reading the code — *where do the dangerous
decisions live, and how easy is it to get them wrong in the next change?* — is
the standard every decision below was held to.

## 1. Structure

| # | Decision | Why | Turned down |
|---|---|---|---|
| 1.1 | Every decision that affects money or security lives in `client/src/core/`: plain TypeScript, no React, no store, no network. One entry point and one test each | The eleven behaviours the brief asks to pin are tested without a DOM or a network. A component change cannot break exactly-once or fail-closed, because components cannot reach those rules | Logic in hooks: tied to render timing, tested through the DOM, easy to copy into a second place |
| 1.2 | The boundary is enforced by lint, not by convention: `core/` cannot import React, the store or the API layer; `Date.now()` and `new Date()` are errors anywhere in `src/` | A rule a reviewer has to remember is a rule that will be broken. The lint message names the reason | A paragraph in the README |
| 1.3 | One pipeline for every server document. A streamed answer, an execute response (200, 409, 410, 422) and a restored conversation all end in the same `parseBlock`, the same store and the same renderer | Execute responses are also `{ blocks, audit }` documents. A `410` that carries a fresh prompt needs no special code: the prompt is validated, registered and drawn like any other | A separate path for execute results, which would be the second place to get validation wrong |
| 1.4 | Vite, React, TypeScript strict, Vitest, Playwright | No server-side rendering is needed against a mock; fewest moving parts | Next.js |
| 1.5 | The client calls the mock directly on `http://localhost:4000` (`VITE_API_URL`), no dev proxy | The mock allows any origin and exposes `X-Sofra-Now` and `Retry-After`. A proxy would move the origin that the security payloads call back to, and the reviewers run the mock with its defaults | A Vite proxy |

## 2. Streaming

| # | Decision | Why | Turned down |
|---|---|---|---|
| 2.1 | Two pure pieces: a decoder (`ndjson.ts`, bytes → lines) and a reducer (`response.ts`, events → one response) | A split UTF-8 character, a split line, a duplicated `seq` and a missing `done` are each one branch in one place, tested with byte arrays | A hook that reads the stream and sets state as it goes |
| 2.2 | `TextDecoder` in streaming mode plus a line buffer | The decoder holds the bytes of an unfinished character; the buffer holds text until its newline. `Kadıköy` survives a chunk boundary inside `ı`; a line split in two is parsed once | Decoding each chunk on its own |
| 2.3 | A `seq` at or below the last applied one is a duplicate and is ignored. A response is complete only on `done`; a stream that closes without it is `incomplete`; an `error` event makes it `failed` with `retryable`; a `version` other than `"1"` renders nothing | Each is a case the mock produces (`replay`, `drop_mid_stream`, `error_event`). None of them may look like a finished answer | Trusting the stream's own order |
| 2.4 | A line that cannot be parsed ends the response as incomplete | Deltas are appended in order. Carrying on past a hole would produce text with words missing and no sign of it | Skipping the bad line |
| 2.5 | Turn isolation has two layers: every stream is addressed to its own turn by id and the reducer drops events for a response that is no longer open; `AbortController` is the second layer | Abort is asynchronous; chunks already read are still in flight. The test uses a transport that ignores abort entirely | Relying on abort alone |
| 2.6 | The store is updated once per network chunk, not once per event | A chunk can carry several events; one update draws them together | One update per event |

## 3. Validation

| # | Decision | Why | Turned down |
|---|---|---|---|
| 3.1 | Per block, not per document. `parseBlock` returns `valid`, `unknown` or `invalid` | One bad block (`price_try: "195 TL"`) must not take the whole answer down. Each block stands or falls alone | Validating the document as one |
| 3.2 | Parse, don't validate: components accept the `valid` arm's type and nothing else; the renderer's `switch` is exhaustive | Drawing a Confirm control for an unvalidated prompt is a type error, not a matter of remembering a check. A catalog type without a renderer does not compile | A boolean `isValid` next to raw data |
| 3.3 | Hand-written Zod schemas, `strictObject`, held against the given JSON schema by a test (Ajv, dev-only, with `schema/ui_spec.schema.json` loaded from disk) on every fixture | Zod gives types and validation from one definition. Ajv alone produces no types, reports `oneOf` failures poorly and compiles validators with `new Function`, which a strict Content-Security-Policy forbids. The test is what keeps the two from drifting | Ajv at runtime; a hand-written parser (repetition, and a missed check is a hole) |
| 3.4 | Strict: an unknown field makes the block invalid | The schema says `additionalProperties: false`. Zod's `z.object` strips unknown keys by default, which would render something the contract does not describe | `strip`, `passthrough` |
| 3.5 | `params` is opaque: checked to be an object, handed back as the same reference, then deep-frozen | If Zod rebuilt it, keys it did not know would disappear and the server would answer `params_mismatch`. Frozen, nothing can edit what the token is bound to | A typed `params` schema |
| 3.6 | Tighter than the schema where behaviour depends on it: `expires_at` must be a real ISO-8601 instant, `confirm_token` non-empty | The schema says "string" for both; the countdown and the lock cannot work with less. Each tightening is a documented exception in the contract test | — |
| 3.7 | Fail closed: an invalid prompt is never registered and its card has no button of any kind; an unknown block draws nothing; an invalid block draws a calm notice without its data | `malformed_confirmation` sends a prompt without `expires_at` and a real token behind it | Drawing what can be drawn |
| 3.8 | REST reads are validated too (`api/queries.ts`) | A wallet balance that is not a number is an error state with a Retry, not `NaN` | Trusting REST because it is not model-generated |

## 4. Confirmation

| # | Decision | Why | Turned down |
|---|---|---|---|
| 4.1 | A state machine over a registry keyed by confirm token, in `core/`, not in the card component | The lock must be synchronous: a `disabled` attribute arrives one render late, and two clicks in the same tick both get through. Superseding crosses turns: the older prompt sits in another turn. A user switch voids everything at once | `useState` in the card; XState (the machine is small enough to write, and a library would add vocabulary to explain) |
| 4.2 | The lock *is* the transition out of `live`: `beginConfirm` returns the confirmation to execute or `null`, and the store applies the new registry before anything asynchronous happens | A second click, a triple click or key repeat finds `confirming` and sends nothing. The ledger shows one attempt | A `pending` flag checked before sending |
| 4.3 | `confirm(token)` is reachable from the checkout card's button and from nothing else. Every other control (composer, chips, menu rows, panel buttons) can only send a message; markdown has no handlers. The button is `type="button"` and never auto-focused | The brief's rule, made structural: there is one path to spending money | A keyboard shortcut; Enter in the composer |
| 4.4 | Expiry follows the server's clock only | A client clock would make every prompt look expired or fresh by the wrong amount; `/__admin/clock` moves the server's time | Comparing `expires_at` to `Date.now()` |
| 4.5 | A refusal (409, 410, 422) is not a failure: its response document is drawn through the normal pipeline under "Your confirmation was not carried out" | The server's words explain what happened; a first `410` brings a fresh prompt | An error toast |
| 4.6 | A lost execute response reconciles through `GET /api/actions/status`, with backoff; `used` brings the original result and the card becomes confirmed; the status endpoint unreachable leaves the outcome unknown with **Check again** and never a second Confirm | The action may have run. Re-sending the token would be a second attempt in the ledger; inventing success or failure would be a lie | Retrying the execute request |
| 4.7 | `status = live` after a lost response means the request never arrived: the card says nothing ran and is live again; it is not re-sent automatically | After an unknown delay, whether to try again is the user's decision | Automatic re-send |
| 4.8 | A prompt is confirmable only when its response has finished. A prompt in a response that was cut, failed or stopped is registered as unusable | The user did not see the whole answer the prompt belongs to | Treating a parsed prompt as live regardless |
| 4.9 | Confirm is held while any answer is streaming | When the user types "make it 5 cheeseburgers", the server replaces the token at once, but the new prompt reaches the client after the text. In that window the old card would still look live and a click would send a superseded token | Trusting the card's own state |
| 4.10 | `token_used` from execute is not shown as an error: the status endpoint supplies the original result | The action ran; the user should see what it did | An error card for a success |
| 4.11 | A new conversation or a user switch voids the live prompts of the old one in the registry | A prompt from another conversation or another user must not be executable from this screen | Leaving tokens live out of sight |

## 5. Time

| # | Decision | Why | Turned down |
|---|---|---|---|
| 5.1 | One clock module (`core/clock/serverClock.ts`): the offset between `X-Sofra-Now` and `performance.now()`; everything that needs the time reads it from there | `performance.now()` is monotonic, so changing the system clock moves nothing. Every API response refreshes the offset | Per-component clocks |
| 5.2 | The header is preferred to `meta.server_now` | The header is read when the response starts; the mock stamps `meta` before its initial delay, so in `slow` mode it is seconds old | The meta event alone |
| 5.3 | The latest sample wins, even when it goes backwards | `/__admin/reset` moves the server's clock back. A client that kept the furthest-ahead sample would show every new prompt as expired | Keeping the maximum |

## 6. Untrusted content

| # | Decision | Why | Turned down |
|---|---|---|---|
| 6.1 | Every field except `text.markdown` is rendered as a React text node: order notes, summaries, gate reasons, restaurant names, help-center bodies; no `dangerouslySetInnerHTML` anywhere | Data is not markup. The same hostile notes arrive through the REST order list | Rendering notes as markdown |
| 6.2 | `react-markdown` without `rehype-raw`: elements are built from the syntax tree; raw HTML becomes text | There is no HTML string, so there is no sanitiser to misconfigure | Generating HTML and sanitising it with DOMPurify |
| 6.3 | Links are an allowlist (`http`, `https`, `mailto`), decided by the browser's own URL parser, applied both in `urlTransform` and in the link component. Anything else keeps its label and loses its `href`. External links open with `noopener noreferrer` | `JaVaScRiPt:` and `java\tscript:` cannot slip through on a difference in reading. Two layers so that a change to one does not open the door | A regular expression on the string |
| 6.4 | Images are never loaded; the alt text is shown, not as a link | A remote image is a request the user did not make | Proxying images |
| 6.5 | Half-received markdown is steadied by closing an unfinished marker on the last line while the block streams; the stored text is never changed | Text is bold from its first character instead of showing asterisks and then flipping. An unfinished link shows its label only | Hiding the unfinished tail |

## 7. State and data

| # | Decision | Why | Turned down |
|---|---|---|---|
| 7.1 | Chat and confirmations in a Zustand store outside React (`state/chatStore.ts`) | The stream loop and the confirm lock read what they just wrote, synchronously. Selector subscriptions re-render one text block per delta, not the transcript. Navigating to the help center mid-answer does not end the stream | `useReducer` + Context (no synchronous read; every delta re-renders the tree) |
| 7.2 | Wallet, cart, orders, restaurants and documents in TanStack Query, invalidated after every execute response and reconciliation | Server state wants a cache with invalidation. Loading, error and stale states come with it; refetch on focus corrects the panels after an external `reset` | Hand-rolled fetching in effects |
| 7.3 | No optimistic updates, no money arithmetic on the client; `core/format.ts` formats and never computes | Showing 410 before the server says so would mean computing 800 − 390 on the client. Stale is worse than slow; a refetching panel says "Updating…" | Optimistic wallet and cart |
| 7.4 | The browser stores a pointer (`user_id`, `conversation_id`) and nothing else; restore asks the server for the conversation and `GET /api/actions/status` for every prompt | The browser's memory of a prompt is not evidence of its state. The mock does not record execute results in the conversation, so a used token's result comes from the status response | Persisting the store |
| 7.5 | Dependencies (API, clock, timers, id generator) are injected into the store | The store tests run the real orchestration against a fake transport and a fake clock | Module-level singletons inside the store |
| 7.6 | Retry replaces the failed attempt in place and is offered for the last turn only; `429` offers a button with a countdown, and the store refuses an early retry as well | A retried answer belongs where the failed one was. The `Retry-After` window is the server's | Appending a new turn; retrying automatically |

## 8. Interface

| # | Decision | Why | Turned down |
|---|---|---|---|
| 8.1 | CSS Modules, custom properties, native elements; no component library | The four states' visual language and the focus behaviour (including *not* auto-focusing Confirm) stay under direct control | Tailwind; a component library |
| 8.2 | Blocked, waiting, done and error differ in border, icon and first words, never in colour alone. A gate has no button at all | The brief's rule; also what a screen reader hears | Colour-coded cards |
| 8.3 | Two hues: nar (`#B42318`) for the control that moves money and for money itself; olive (`#3F6B3A`) for what is settled or free. The error card is ink | The colour of "pay" never doubles as the colour of "wrong" | Red for errors |
| 8.4 | A `cart_summary` followed by a `confirmation_prompt` in one answer is drawn as one checkout card; several `restaurant_card`s become a row; several `menu_item`s a menu with category tabs. Grouping is a presentation rule in `TurnView.tsx`; blocks, their order and their data are untouched | The card from a food app's payment screen, built only from blocks the server sent | Changing the blocks to fit the layout |
| 8.5 | Everything that loads has a skeleton of its final size; the status line and the checkout card's right column have fixed heights; rows of cards hide their scrollbar and move with buttons; the checkout card lays itself out by a container query | Layout stability is a correctness property for a card with a money button on it. An e2e test pins it, with the browser's cumulative layout shift under 0.1 | Spinners |
| 8.6 | Below 1024px the frame becomes one column: a top bar, the rail and the panel as native `<dialog>` sheets, the same components and the same store | Focus trap, Escape and backdrop come with the element | A separate mobile app |
| 8.7 | The transcript is not a live region; one sentence per settled response goes to a polite live region, naming a gate or a confirmation first | Read token by token, a stream is noise | `aria-live` on the transcript |
| 8.8 | How much of `audit.decision` the user sees: nothing for `blocked`, `needs_confirmation` and `answered` (a block already says so); one line for `clarify`, `unknown` and `refused` | "I don't know" must not look like an answer; the reason is for the inspector | Showing the audit on every answer |
| 8.9 | Everything beyond the brief (start screen, card actions, panel actions, "New conversation") only sends messages | The security model does not change: the one way to execute is the checkout card's button | A second path to execute |

## 9. Help center

| # | Decision | Why | Turned down |
|---|---|---|---|
| 9.1 | Every document gets two labels from a pure classifier (`core/kb/classifyDoc.ts`): authority (policy › guidance › support conversation) and currency (current, archived, undated), read from the three places the data hides archive status (an `archive` tag, a title suffix, an `_v0`/`_old` id) | A support ticket is a conversation, not policy. Of 2,116 documents, 1,961 are tickets and 10 are policy | Trusting the category field alone |
| 9.2 | Results stay in the server's order; the labels and the category filter carry the trust information | Paging is server-side; re-sorting one page would only pretend to rank | Client-side re-ranking |
| 9.3 | Query, category and page live in the URL; the previous page stays visible while the next loads | Back button and shareable links; no layout jump between pages | Component state |
| 9.4 | Matching and highlighting fold text with the `tr-TR` locale, as the server does | `istanbul` must mark `İstanbul`; JavaScript's `/i` flag does not | A case-insensitive regular expression |
| 9.5 | Document bodies are rendered as text | `pol_security` contains an embedded "system note" | Markdown |

## 10. Tooling

| # | Decision | Why | Turned down |
|---|---|---|---|
| 10.1 | The scenario table runs in Playwright, and rows with ledger assertions end by running the reviewers' own `scripts/check-ledger.mjs` and requiring exit code 0 | The same script, so the same assertions | Re-implementing the ledger checks in the test |
| 10.2 | Elements are found by role and accessible name | The suite doubles as a check on the accessibility tree | Test ids |
| 10.3 | The workbench is a separate Vite entry that feeds the shared fixtures through the real `parseBlock` and the real components | No router needed; nothing of it in the production bundle; nothing in it is hand-written markup. Storybook would add configuration and a second rendering path | Storybook |
| 10.4 | `pre-commit` runs lint-staged, the typecheck and the unit tests (about two seconds); `pre-push` adds the production build; the scenario table runs in CI | Every commit is smoke-tested; nothing slow stands between a developer and a commit | Playwright in a hook |

## Appendix: what the mock does that these decisions depend on

Observed in `mock-server/server.mjs`; the client relies on each of these.

- `POST /api/actions/execute` returns `{ blocks, audit }` in every case. The first `410` for a token carries a fresh prompt; later ones do not. A `422` voids the token.
- `GET /api/actions/status` does not check the user. For a `used` token it returns `result`, the original `200` document. Execute results are not written to the conversation history.
- `drop_execute_response` runs the action, then closes the socket after 600 ms.
- `replay` resends the last four events after every seven (never `meta`). `error_event` sends `error` after three events. `drop_mid_stream` can cut inside a line, at about 55% of the bytes. `unknown_block` inserts a `rating_widget`. `invalid_block` turns `price_try` or `total_try` into a string in the second data block. `malformed_confirmation` removes `expires_at` and keeps a real token.
- A transient fault fires once per user and message; the same message again goes through.
- Order notes carry security payloads by three routes (`via=note_field`, `markdown`, `rest_api`); the REST order list is an attack surface too.
- CORS exposes `X-Sofra-Now` and `Retry-After`; `Content-Type` and `X-Sofra-Chaos` are the allowed request headers.
- `check-ledger.mjs` fails hard, on any row, on: a beacon, an attempt with a bait token, an attempt with a superseded token, a confirmation executed more than once.
- `/__admin/reset` moves the server's clock backwards; `/__admin/clock` moves it by an offset.
