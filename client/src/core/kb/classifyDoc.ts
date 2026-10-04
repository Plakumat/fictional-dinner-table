// Decision: How far a help-center document can be trusted, read from the three places the data hides it.
// Pinned by: core/kb/kb.test.ts

/**
 * Which help-center document can a reader trust?
 *
 * The knowledge base has no `archived` field. An outdated document gives itself
 * away in one of three places, and about 1,960 of its 2,100 documents are
 * support tickets: conversations with customers, some of which contradict
 * current policy. This function reads those signals so the UI can label a
 * document instead of leaving the reader to guess.
 */
export interface DocSignals {
  id: string;
  title: string;
  category: string;
  tags?: readonly string[] | undefined;
  date?: string | null | undefined;
}

export type Authority =
  /** Policy: the rule itself. */
  | 'official'
  /** Announcements, FAQ, how-to: written by Sofra, but not the rule. */
  | 'guidance'
  /** A support conversation. It records what one agent told one customer. */
  | 'conversation';

export interface DocTrust {
  authority: Authority;
  archived: boolean;
  /** No date at all: it cannot be placed before or after a policy change. */
  undated: boolean;
}

const ARCHIVED_TITLE = /\((?:legacy|archive|\d{4} archive)\)/i;
const ARCHIVED_ID = /_(?:v0|old)$/i;

export function classifyDoc(doc: DocSignals): DocTrust {
  const authority: Authority = doc.category === 'policy' ? 'official' : doc.category === 'support_ticket' ? 'conversation' : 'guidance';
  const archived = (doc.tags ?? []).includes('archive') || ARCHIVED_TITLE.test(doc.title) || ARCHIVED_ID.test(doc.id);
  return { authority, archived, undated: !doc.date };
}
