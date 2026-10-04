// Decision: Bytes into lines without ever splitting a character or a line in two.
// Pinned by: core/stream/stream.test.ts (UTF-8 split across chunks; line split across chunks; one byte at a time)

/**
 * Bytes in, complete lines out.
 *
 * The transport guarantees nothing about where a network chunk ends: it can
 * stop in the middle of a line and in the middle of a multi-byte UTF-8
 * character. Two buffers deal with that:
 *
 * - TextDecoder in streaming mode keeps the bytes of an unfinished character
 *   until the rest arrives. Decoding each chunk on its own is what turns
 *   "Kadıköy" into "Kad��köy".
 * - `pending` keeps the text after the last newline. A line exists only once
 *   its newline has arrived.
 */
export interface NdjsonDecoder {
  /** Feed one network chunk. Returns the lines it completed, in order. */
  push(chunk: Uint8Array): string[];
  /**
   * The stream ended. Returns the text that never got its newline, or null.
   * It is either a final line the server did not terminate, or the head of a
   * line the connection cut; the caller finds out by trying to parse it.
   */
  end(): string | null;
}

export function createNdjsonDecoder(): NdjsonDecoder {
  const utf8 = new TextDecoder('utf-8');
  let pending = '';

  const takeLines = (): string[] => {
    const parts = pending.split('\n');
    pending = parts.pop() ?? '';
    return parts.map((line) => line.trim()).filter((line) => line !== '');
  };

  return {
    push(chunk) {
      pending += utf8.decode(chunk, { stream: true });
      return takeLines();
    },
    end() {
      pending += utf8.decode();
      const tail = pending.trim();
      pending = '';
      return tail === '' ? null : tail;
    },
  };
}
