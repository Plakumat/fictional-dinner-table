# Documentation

Start with the root [`README.md`](../README.md): what is built, the
architecture, and why. The pages here go one level deeper.

| Page | What it is for |
|---|---|
| [`architecture-decisions.md`](architecture-decisions.md) | The ledger of decisions: each with its reason and the alternative turned down, plus what the mock does that the client depends on |
| [`../client/src/core/README.md`](../client/src/core/README.md) | The map of the dangerous decisions: the file each lives in and the test that pins it |
| [`diagrams/`](diagrams/) | The diagrams below, as Mermaid sources (`.mmd`) and rendered PNGs. Nothing needs rendering to read them; `npm run diagrams` in `client/` re-renders a source after a change |
| [`design/benchmark.md`](design/benchmark.md) | What Turkish food-delivery apps share, and how those patterns were applied; the brand sheet and the mock-up the interface was built from |
| [`screenshots/`](screenshots/) | The product at rows 4–9 of the scenario table and in a few other states. `npm run capture` in `client/` regenerates them |
| [`screen-reader-run.md`](screen-reader-run.md) | The procedure for the screen-reader run of rows 4–5, and what was heard |
| [`../AGENTS.md`](../AGENTS.md) | The rules for changing this code, for people and for coding agents |

## Diagrams

| | |
|---|---|
| [`00-the-flow`](diagrams/00-the-flow.png) | One order in plain words, from the message to the wallet. The place to start |
| [`01-overview`](diagrams/01-overview.png) | The whole client on one page: the given server, the pure core, the store, the query cache, the UI |
| [`02-pipeline`](diagrams/02-pipeline.png) | One pipeline for every server document: a streamed answer, an execute response and a restored conversation all pass through the same validation and the same renderer |
| [`03-confirmation-states`](diagrams/03-confirmation-states.png) | The lifecycle of one confirmation prompt, as the state machine implements it |
| [`04-confirm-execute-reconcile`](diagrams/04-confirm-execute-reconcile.png) | From a click on "Place order" to the wallet changing: the lock, the request, each outcome, reconciliation, refetch |
| [`05-ownership`](diagrams/05-ownership.png) | Who owns what: what the server decides, what the client holds, what the client never does |
| [`06-resume`](diagrams/06-resume.png) | Resuming after a reload from a pointer, with every prompt's state taken from the server |

## Screenshots

| File | Row | What to look at |
|---|---|---|
| `row-04-prompt.png` | 4 | The checkout card: dashed border, "Needs your confirmation", the countdown, one button |
| `row-05-confirmed.png` | 5 | The result drawn under the prompt; the wallet refetched |
| `row-06-triple-click-inspector.png` | 6 | One execution after a triple click; the inspector showing the token's state |
| `row-07-replaced.png` | 7 | The older prompt marked "Replaced", the newer one live |
| `row-08-expires-soon.png`, `row-08-expired.png` | 8 | The countdown on the server clock, then the expired card without a button |
| `row-09-reconciled.png` | 9 | A lost execute response reconciled through the status endpoint |
| `gate.png` | 10 | A verification gate: hatched band, "Blocked · nothing was executed", no button |
| `destructive-prompt.png` | 14 | A destructive confirmation says so in words |
| `untrusted-notes.png` | 17 | Hostile order notes rendered as text |
| `incomplete.png` | 21 | A stream cut mid-way: what arrived stays, marked incomplete |
| `help-center.png` | — | The help center with trust labels and an archived policy |
| `workbench.png` | — | Every block in every state, side by side |
| `phone-home.png`, `phone-checkout.png` | — | The start screen and the checkout card on a phone |
