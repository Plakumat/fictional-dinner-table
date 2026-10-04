import { formatTry } from '../../core/format';
import type { ResponseState } from '../../core/stream/response';

/** Markdown reduced to the words a screen reader should say. */
const spoken = (markdown: string): string =>
  markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)+/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)+/g, '$1')
    .replace(/[*`>#]/g, '')
    // Emphasis underscores only: an order id such as u_ok_o9 keeps its own.
    .replace(/(^|\s)_+|_+(?=\s|$|[.,;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * One announcement for a finished response.
 *
 * Streaming text is not a live region: read token by token it is noise. When
 * the response settles, this sentence is placed in a polite live region, and a
 * gate or a confirmation is named for what it is before its details.
 */
export function describeResponse(response: ResponseState): string {
  const parts: string[] = [];
  for (const slot of response.blocks) {
    if (slot?.kind !== 'valid') continue;
    const block = slot.block;
    switch (block.type) {
      case 'text':
        parts.push(spoken(block.markdown));
        break;
      case 'verification_gate':
        parts.push(`Blocked. ${block.reason} Nothing was executed.`);
        break;
      case 'confirmation_prompt':
        parts.push(`Confirmation needed. ${block.summary}`);
        break;
      case 'cart_summary':
        parts.push(`Cart, total ${formatTry(block.total_try)}.`);
        break;
      case 'order_summary':
        parts.push(`Order ${block.order_id}, ${block.status}.`);
        break;
      case 'restaurant_card':
      case 'menu_item':
        parts.push(`${block.name}.`);
        break;
      case 'error':
        parts.push(`Error. ${block.message}`);
        break;
      case 'suggested_actions':
        break;
    }
  }
  const { phase } = response;
  if (phase.kind === 'incomplete') parts.push('This answer is incomplete: the connection was lost.');
  if (phase.kind === 'failed') parts.push(`The answer failed. ${phase.message}`);
  if (phase.kind === 'stopped') parts.push('Answer stopped.');
  if (phase.kind === 'unsupported_version') parts.push('This answer uses a format this app cannot display.');
  return parts.join(' ');
}
