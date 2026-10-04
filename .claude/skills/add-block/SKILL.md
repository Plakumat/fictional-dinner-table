---
name: add-block
description: The required order of changes when the Sofra component catalog or stream protocol changes — a new block type, a new field, a new event. Use whenever schema/ui_spec.schema.json or schema/stream_events.schema.json would change, or when a reviewer asks "what happens when a block is added".
---

# Changing the contract

The client fails closed: a block type it does not know draws nothing, a field
it does not know makes the block invalid. Adding to the catalog is therefore a
fixed sequence, and the compiler and the tests refuse to let a step be skipped.

1. **Contract.** The schema files under `schema/` are the backend's; in this
   repository they are read-only. Describe the change against them in
   `README.md` ("What the contract is missing") if it is a proposal rather than
   a shipped change.
2. **Zod schema.** Add the block to `BLOCK_SCHEMAS` in
   `client/src/core/contract/schemas.ts` as a `strictObject`. Tighten only what
   the client's behaviour depends on, and document each tightening.
3. **Fixtures.** Add at least one valid and one invalid example to
   `client/src/fixtures/blocks.ts`. `contract.test.ts` fails until every catalog
   type has both.
4. **Contract test.** Run `npm test -- contract`. Ajv (with the real JSON
   schema) and Zod must agree on every fixture; a deliberate tightening is
   marked `stricterThanSchema`.
5. **Renderer.** Add a case to `ValidBlock` in `client/src/ui/blocks/BlockView.tsx`.
   The exhaustive `switch` does not compile without it. Put the component in
   `DataBlocks.tsx` (read-only blocks) or its own file (anything with
   behaviour). The component accepts the validated type only.
6. **Grouping.** If several of the new blocks should be drawn together (as
   restaurant cards and menu items are), extend `groupBlocks` in
   `client/src/ui/chat/TurnView.tsx`.
7. **Announcement.** Add a sentence for it in `client/src/ui/chat/announce.ts`
   so a screen reader hears it for what it is.
8. **Workbench.** Open `http://localhost:5173/workbench.html`: the fixtures
   appear automatically. Check the block in every state next to the four that
   must never be confused.
9. **Inspector.** Nothing to do: unknown and invalid blocks are already listed.
10. **Record.** Add the decision to `client/src/core/README.md` if it is a
    dangerous one, and the header comment ("Decision / Pinned by") to any new
    file in `core/`.

For a new **stream event**: `client/src/core/stream/events.ts` (schema),
`response.ts` (reducer case), `stream.test.ts` (behaviour pinned), in that order.
