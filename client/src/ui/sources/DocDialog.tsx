import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useKbDoc } from '../../api/queries';
import { Icon } from '../Icon';
import { DocView } from './DocView';
import styles from './sources.module.css';

/**
 * The document viewer opened from a citation. A native <dialog>: the browser
 * traps focus inside it, closes it on Escape and returns focus to the citation.
 */
export function DocDialog({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const query = useKbDoc(docId);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (docId !== null && !el.open) el.showModal();
    if (docId === null && el.open) el.close();
  }, [docId]);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="Help-center document" onClose={onClose}>
      <div className={styles.dialogBar}>
        <span className={styles.citationsLabel}>Help center</span>
        <button type="button" className="button" onClick={onClose}>
          <Icon name="cross" size={15} /> Close
        </button>
      </div>
      {query.isPending && docId !== null && <p className="muted">Loading document…</p>}
      {query.isError && (
        <div>
          <p>This document could not be loaded.</p>
          <button type="button" className="button" onClick={() => void query.refetch()}>
            <Icon name="retry" size={15} /> Try again
          </button>
        </div>
      )}
      {query.data && <DocView doc={query.data} />}
      {query.data && (
        <p className={styles.more}>
          <Link to={`/help/${encodeURIComponent(query.data.id)}`} className="button" onClick={onClose}>
            Open in the help center <Icon name="right" size={15} />
          </Link>
        </p>
      )}
    </dialog>
  );
}
