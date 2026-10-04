# `core/` — where the dangerous decisions live

Plain TypeScript. Nothing in this folder imports React, the store or the
network layer; an ESLint rule (`client/eslint.config.js`) refuses the import.
Every file starts with two lines: the decision it carries and the test that
pins it. This page is the map.

| Decision                                                                                                                                                                           | Where                                            | Pinned by                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| A UTF-8 character or a line split across network chunks is reassembled before anything reads it                                                                                    | `stream/ndjson.ts`                               | `stream/stream.test.ts`                                           |
| An event whose `seq` was already applied is a duplicate; a response is complete only on `done`; an unsupported version renders nothing; nothing lands in a response that has ended | `stream/response.ts`                             | `stream/stream.test.ts`, `state/chatStore.test.ts`                |
| A block becomes `valid`, `unknown` or `invalid`; components accept `valid` only, so an unvalidated Confirm control is a type error                                                 | `contract/parseBlock.ts`, `contract/schemas.ts`  | `contract/parseBlock.test.ts`, `ui/ui.test.tsx`                   |
| The hand-written Zod schemas agree with the given JSON schema                                                                                                                      | `contract/schemas.ts`                            | `contract/contract.test.ts` (Ajv vs Zod on 37 fixtures)           |
| `params` goes back to the server as the same, frozen object                                                                                                                        | `contract/schemas.ts`, `contract/parseBlock.ts`  | `contract/parseBlock.test.ts`, `state/chatStore.test.ts`          |
| One deliberate action, one execute request: the lock is the transition out of `live`                                                                                               | `confirmation/machine.ts` (`beginConfirm`)       | `state/chatStore.test.ts`, `ui/ui.test.tsx`, e2e `sc_06`          |
| A newer prompt for the same action makes the older one inert                                                                                                                       | `confirmation/machine.ts` (`registerPrompt`)     | `state/chatStore.test.ts`, e2e `sc_07`                            |
| A lost execute response is reconciled through `GET /api/actions/status`, never re-approved                                                                                         | `confirmation/machine.ts`, `state/chatStore.ts`  | `state/chatStore.test.ts`, e2e `sc_09`                            |
| A prompt from a restored conversation takes the server's word for its state, never the browser's                                                                                   | `confirmation/machine.ts` (`restorePrompt`)      | `state/chatStore.test.ts`                                         |
| Time comes from `X-Sofra-Now`; the latest sample wins                                                                                                                              | `clock/serverClock.ts`                           | `state/chatStore.test.ts`, e2e `sc_08`; lint forbids `Date.now()` |
| Only `http`, `https` and `mailto` links are clickable; images are never loaded                                                                                                     | `markdown/safeLink.ts`, `ui/blocks/Markdown.tsx` | `markdown/markdown.test.ts`, `ui/ui.test.tsx`, e2e `sc_17`        |
| Half-received markdown is steadied, never altered                                                                                                                                  | `markdown/stableMarkdown.ts`                     | `markdown/markdown.test.ts`                                       |
| Money and dates are formatted, never computed                                                                                                                                      | `format.ts`                                      | e2e `sc_01`, `sc_17`                                              |
| A help-center document is labelled by authority and currency, with Turkish-aware matching                                                                                          | `kb/classifyDoc.ts`, `kb/foldTr.ts`              | `kb/kb.test.ts`                                                   |

What is deliberately _not_ here: anything that talks to the network
(`api/`), anything that orchestrates (`state/chatStore.ts`), anything that
draws (`ui/`). Those layers call into this one and are tested through it.
