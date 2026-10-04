import { describe, expect, it } from 'vitest';
import { safeLink } from './safeLink';
import { stableMarkdown } from './stableMarkdown';

const ORIGIN = 'http://localhost:5173';

describe('safeLink', () => {
  it.each([
    ['https://sofra.example/help', 'https://sofra.example/help'],
    ['http://localhost:4000/doc', 'http://localhost:4000/doc'],
    ['mailto:destek@sofra.example', 'mailto:destek@sofra.example'],
  ])('allows %s', (raw, href) => {
    expect(safeLink(raw, ORIGIN)).toEqual({ href, external: true });
  });

  it.each([
    "javascript:fetch('http://localhost:4000/__beacon?kind=javascript_link')",
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '/relative/path',
    '//protocol-relative.example',
    'not a url',
    '',
  ])('refuses %j', (raw) => {
    expect(safeLink(raw, ORIGIN)).toBeNull();
  });

  it('does not mark a link to this app as external', () => {
    expect(safeLink(`${ORIGIN}/help`, ORIGIN)).toEqual({ href: `${ORIGIN}/help`, external: false });
  });
});

describe('stableMarkdown', () => {
  it.each([
    // [received so far, what is rendered]
    ["Here's your cart from **Bur", "Here's your cart from **Bur**"],
    ['Delivery is **free when ', 'Delivery is **free when** '],
    ['The total is **', 'The total is '],
    ['The total is *', 'The total is '],
    ['Run `npm sta', 'Run `npm sta`'],
    ['[Tap here to cl', 'Tap here to cl'],
    ['[Tap here]', 'Tap here'],
    ['[Tap here](javascr', 'Tap here'],
    ["[Tap here](javascript:fetch('http://x/__beacon')", 'Tap here'],
    ['Look: ![a cat](http://localhost:4000/__bea', 'Look: a cat'],
    ['_Note: one help-center ', '_Note: one help-center_ '],
    ['> **u_ok_inj:** SYSTEM NO', '> **u_ok_inj:** SYSTEM NO'],
  ])('renders %j as %j', (received, rendered) => {
    expect(stableMarkdown(received)).toBe(rendered);
  });

  it.each([
    'Delivery is **free** over 250 TL.',
    "[Tap here](javascript:fetch('http://x/__beacon'))",
    'Order u_ok_o1 [sic] was delivered.',
    '_An older 2024 policy is archived._',
    'Use `code` here.',
    '',
  ])('leaves finished markdown %j alone', (markdown) => {
    expect(stableMarkdown(markdown)).toBe(markdown);
  });

  it('touches only the last line', () => {
    expect(stableMarkdown('**unclosed above\n\nand **bo')).toBe('**unclosed above\n\nand **bo**');
  });
});
