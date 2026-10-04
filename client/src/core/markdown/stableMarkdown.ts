// Decision: Half-received markdown renders the way it will render whole, so text does not flicker between interpretations while it streams.
// Pinned by: core/markdown/markdown.test.ts

/**
 * Makes half-received markdown render the way it will once it is whole.
 *
 * Deltas split text anywhere, including inside `**bold**` or a link. Rendered
 * as is, "**Bur" shows two literal asterisks and then flips to bold when the
 * closing pair arrives; a link shows its raw "[label](http://…" first. This
 * function is applied only while a text block is still streaming, and only to
 * its last line (everything above it is settled):
 *
 * - an unfinished `**strong**`, `` `code` `` or leading `_emphasis_` is closed,
 *   so the text is styled from its first character and never flips;
 * - an unfinished link or image is shown as its label until its closing
 *   parenthesis arrives.
 *
 * It is a display aid, not a parser. The stored markdown is never changed, and
 * once the stream ends the block is rendered from the original text.
 */
export function stableMarkdown(markdown: string): string {
  const lineStart = markdown.lastIndexOf('\n') + 1;
  let line = hideUnfinishedLink(markdown.slice(lineStart));
  // Half of a "**" marker at the very end.
  if (/(^|[^*])\*$/.test(line)) line = line.slice(0, -1);
  line = closeMarker(line, '**');
  line = closeMarker(line, '`');
  line = closeLeadingEmphasis(line);
  return markdown.slice(0, lineStart) + line;
}

/** Index just past the `)` that closes a link destination starting at `open` (the `(`), or -1. */
function endOfDestination(line: string, open: number): number {
  let depth = 0;
  for (let i = open; i < line.length; i++) {
    if (line[i] === '(') depth++;
    else if (line[i] === ')' && --depth === 0) return i + 1;
  }
  return -1;
}

function hideUnfinishedLink(line: string): string {
  const open = line.lastIndexOf('[');
  if (open === -1) return line;
  const close = line.indexOf(']', open);
  const label = line.slice(open + 1, close === -1 ? undefined : close);
  const before = line.slice(0, line[open - 1] === '!' ? open - 1 : open);

  if (close === -1 || close === line.length - 1) return before + label;
  // "[text] more": brackets that are not a link. Leave them alone.
  if (line[close + 1] !== '(') return line;
  return endOfDestination(line, close + 1) === -1 ? before + label : line;
}

function closeMarker(line: string, marker: string): string {
  if ((line.split(marker).length - 1) % 2 === 0) return line;
  // An opener with nothing after it yet: hide it.
  if (line.endsWith(marker)) return line.slice(0, -marker.length);
  // A closer only counts if it touches the text, so it goes before trailing spaces.
  const text = line.trimEnd();
  return text + marker + line.slice(text.length);
}

function closeLeadingEmphasis(line: string): string {
  const match = /^((?:>\s*)*)_(?!_)(.*)$/.exec(line);
  if (!match) return line;
  const body = match[2] ?? '';
  if (body === '') return match[1] ?? '';
  // Already closed: an underscore followed by the end of the line or punctuation.
  if (/\S_(\W|$)/.test(body)) return line;
  const text = line.trimEnd();
  return text + '_' + line.slice(text.length);
}
