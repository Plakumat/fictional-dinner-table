import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { KB_PAGE_SIZE, useKbDoc, useKbSearch, type KbHit } from '../../api/queries';
import { highlight } from '../../core/kb/foldTr';
import { formatDay } from '../../core/format';
import { Icon } from '../Icon';
import { DocSkeleton, LoadingNote, ResultsSkeleton } from '../Skeleton';
import { DocView, TrustLabels } from '../sources/DocView';
import styles from './help.module.css';

const CATEGORIES = [
  ['', 'All documents'],
  ['policy', 'Policies'],
  ['faq', 'FAQ'],
  ['howto', 'How-to'],
  ['announcement', 'Announcements'],
  ['support_ticket', 'Support conversations'],
] as const;

const DEBOUNCE_MS = 250;

/**
 * Search over the help center. The state of the search (query, category, page)
 * lives in the URL, so Back works and a result page can be linked to.
 *
 * Results stay in the server's relevance order. Paging happens on the server,
 * so re-sorting one page here would only pretend to rank. What the client adds
 * is a label on every result saying how far it can be trusted.
 */
export function HelpSearch() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [draft, setDraft] = useState(query);

  // Every change is merged into the URL as it is when the change happens, read
  // from the address bar. The values in this render (and the "previous params"
  // React Router hands to an updater) can be a render old by the time a
  // debounced search fires, and would then undo a category picked in between.
  const update = (next: { q?: string; category?: string; page?: number }, replace = false) => {
    const current = new URLSearchParams(window.location.search);
    const merged = {
      q: next.q ?? current.get('q') ?? '',
      category: next.category ?? current.get('category') ?? '',
      page: next.page ?? (Number(current.get('page')) || 1),
    };
    const out = new URLSearchParams();
    if (merged.q) out.set('q', merged.q);
    if (merged.category) out.set('category', merged.category);
    if (merged.page > 1) out.set('page', String(merged.page));
    setParams(out, { replace });
  };

  // Typing searches after a short pause, and replaces the history entry instead of adding one per keystroke.
  useEffect(() => {
    if (draft === query) return;
    const id = setTimeout(() => update({ q: draft, page: 1 }, true), DEBOUNCE_MS);
    return () => clearTimeout(id);
    // Runs when the text changes. `update` reads the URL at call time, so it is safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const search = useKbSearch(query, category, page);
  const total = search.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / KB_PAGE_SIZE));
  const first = search.data ? search.data.offset + 1 : 0;
  const last = search.data ? search.data.offset + search.data.results.length : 0;

  return (
    <main className={styles.page}>
      <title>Help center · Sofra</title>
      <div className={styles.hero}>
        <h1>Help center</h1>
        <p className="muted">Policies, answers and past support conversations. Every result says how far it can be trusted.</p>
      </div>

      <form
        className={styles.controls}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: draft, page: 1 });
        }}
      >
        <label className={styles.searchPill}>
          <Icon name="search" size={18} />
          <span className="visually-hidden">Search the help center</span>
          <input
            type="search"
            className={styles.searchInput}
            value={draft}
            placeholder="Search… delivery fee, İstanbul, refund"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <label className={styles.filter}>
          <span className={styles.filterLabel}>Show</span>
          <select className="select" value={category} onChange={(event) => update({ q: draft, category: event.target.value, page: 1 })}>
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </form>

      <p className={styles.legend}>
        <Icon name="info" size={15} />
        <span>
          Most documents here are support conversations: what one agent told one customer, sometimes before a policy changed. For the rule itself,
          look for <strong>Policy</strong>. Anything marked <strong>Archived</strong> no longer applies.
        </span>
      </p>

      <p className={styles.count} role="status">
        {search.isPending ? 'Searching…' : search.isError ? '' : total === 0 ? 'No documents match.' : `Showing ${first}–${last} of ${total}`}
        {search.isFetching && !search.isPending && ' · Updating…'}
      </p>

      {search.isError && (
        <div className={styles.message}>
          <p>
            <Icon name="alert" size={15} /> The help center could not be searched.
          </p>
          <button type="button" className="button" onClick={() => void search.refetch()}>
            <Icon name="retry" size={15} /> Try again
          </button>
        </div>
      )}

      {search.isPending && (
        <>
          <ResultsSkeleton />
          <LoadingNote what="results" />
        </>
      )}

      {search.data && (
        <ol className={styles.results} aria-busy={search.isFetching} data-stale={search.isPlaceholderData}>
          {search.data.results.map((hit) => (
            <Result key={hit.id} hit={hit} query={query} />
          ))}
        </ol>
      )}

      {search.data && pages > 1 && (
        <nav className={styles.pager} aria-label="Result pages">
          <button type="button" className="button" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
            <Icon name="left" size={16} /> Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" className="button" disabled={page >= pages} onClick={() => update({ page: page + 1 })}>
            Next <Icon name="right" size={16} />
          </button>
        </nav>
      )}
    </main>
  );
}

/** Text with the query's matches marked, using the same Turkish folding as the server. */
const Marked = ({ text, query }: { text: string; query: string }) => (
  <>{highlight(text, query).map((segment, i) => (segment.hit ? <mark key={i}>{segment.text}</mark> : segment.text))}</>
);

function Result({ hit, query }: { hit: KbHit; query: string }) {
  return (
    <li className={styles.result}>
      <Link to={`/help/${encodeURIComponent(hit.id)}`} className={styles.resultLink}>
        <h2 className={styles.resultTitle}>
          <Marked text={hit.title} query={query} />
        </h2>
        <Icon name="right" size={18} />
      </Link>
      <TrustLabels doc={hit} />
      {/* The snippet is document text: untrusted, and rendered as text. */}
      <p className={styles.snippet}>
        <Marked text={hit.snippet} query={query} />…
      </p>
      <p className={styles.resultMeta}>
        <span className="mono">{hit.id}</span> · {hit.date ? formatDay(hit.date) : 'no date'}
      </p>
    </li>
  );
}

export function HelpDoc() {
  const { docId } = useParams();
  const doc = useKbDoc(docId ?? null);
  return (
    <main className={styles.page}>
      <Link to="/help" className={`button ${styles.back}`}>
        <Icon name="back" size={16} /> Help center
      </Link>
      {doc.isPending && (
        <>
          <DocSkeleton />
          <LoadingNote what="document" />
        </>
      )}
      {doc.isError && (
        <div className={styles.message}>
          <p>
            <Icon name="alert" size={15} /> This document could not be loaded.
          </p>
          <button type="button" className="button" onClick={() => void doc.refetch()}>
            <Icon name="retry" size={15} /> Try again
          </button>
        </div>
      )}
      {doc.data && (
        <article className={styles.docCard}>
          <title>{`${doc.data.title} · Help center · Sofra`}</title>
          <DocView doc={doc.data} />
        </article>
      )}
    </main>
  );
}
