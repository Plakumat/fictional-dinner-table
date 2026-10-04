// Decision: Which link in model-written markdown may be clicked: an allowlist of three schemes, parsed by the browser's own URL parser.
// Pinned by: core/markdown/markdown.test.ts; ui/ui.test.tsx (hostile markdown renders inert); e2e sc_17 (zero beacons)

/**
 * The one decision about which link in assistant markdown may be clicked.
 *
 * An allowlist, not a blocklist: http, https and mailto are links, everything
 * else (javascript:, data:, vbscript:, relative paths, anything unparseable) is
 * shown as plain text. The URL is parsed with the same parser the browser uses
 * for navigation, so "JaVaScRiPt:" or "java\tscript:" cannot slip through on a
 * difference between how we read it and how the browser would.
 */
export interface SafeLink {
  href: string;
  /** Leaves this app: opened in a new tab without access to this one, and marked as such. */
  external: boolean;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function safeLink(raw: string | null | undefined, pageOrigin: string): SafeLink | null {
  if (!raw) return null;
  let url: URL;
  try {
    // No base URL on purpose: a relative link has no business in an assistant answer.
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  return { href: url.href, external: url.protocol === 'mailto:' || url.origin !== pageOrigin };
}
