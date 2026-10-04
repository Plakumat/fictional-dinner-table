import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { BLOCK_FIXTURES } from '../../fixtures/blocks';
import { parseBlock } from './parseBlock';

// The Zod schemas in schemas.ts are written by hand, so they could drift from
// the contract in schema/ui_spec.schema.json. This test holds them together:
// every fixture is judged by both, with the real JSON schema loaded from disk,
// and the two must agree.
//
// Ajv is a dev dependency used only here. It is not the runtime validator: it
// gives no TypeScript types, and it compiles schemas with `new Function`, which
// a strict Content-Security-Policy forbids.

const schema = JSON.parse(readFileSync(new URL('../../../../schema/ui_spec.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(schema);
const validBySchema = ajv.getSchema('https://sofra.example/ui_spec.schema.json#/definitions/block')!;

describe('Zod schemas agree with ui_spec.schema.json', () => {
  it.each(BLOCK_FIXTURES)('$name', ({ block, expect: expected, stricterThanSchema }) => {
    const bySchema = validBySchema(block) === true;
    const parsed = parseBlock(block);

    expect(parsed.kind).toBe(expected);
    if (stricterThanSchema) {
      // The documented exceptions: the contract allows it, the client refuses it.
      expect(bySchema).toBe(true);
      expect(parsed.kind).toBe('invalid');
    } else {
      expect(parsed.kind === 'valid').toBe(bySchema);
    }
  });

  it('never accepts a block the contract rejects', () => {
    const accepted = BLOCK_FIXTURES.filter((f) => parseBlock(f.block).kind === 'valid');
    expect(accepted.length).toBeGreaterThan(0);
    for (const fixture of accepted) expect(validBySchema(fixture.block), fixture.name).toBe(true);
  });

  it('covers every block type in the catalog, valid and invalid', () => {
    const catalog: string[] = schema.definitions.block.oneOf.map((ref: { $ref: string }) => ref.$ref.split('/').pop());
    for (const type of catalog) {
      const ofType = BLOCK_FIXTURES.filter((f) => (f.block as { type?: string }).type === type);
      expect(
        ofType.some((f) => f.expect === 'valid'),
        `${type}: a valid fixture`,
      ).toBe(true);
      expect(
        ofType.some((f) => f.expect === 'invalid'),
        `${type}: an invalid fixture`,
      ).toBe(true);
    }
  });
});
