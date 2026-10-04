import { useOpenDoc } from './DocContext';
import styles from './sources.module.css';

/**
 * audit.kb_doc_ids as citations. The order is the server's: the primary source
 * comes first, and the client does not re-rank it.
 */
export function Citations({ docIds }: { docIds: readonly string[] }) {
  const openDoc = useOpenDoc();
  return (
    <div className={styles.citations}>
      <span className={styles.citationsLabel}>Sources</span>
      <ol className={styles.citationList} aria-label="Sources for this answer">
        {docIds.map((docId, index) => (
          <li key={docId}>
            <button type="button" className={styles.citation} onClick={() => openDoc(docId)}>
              <span className="mono">{docId}</span>
              {index === 0 && docIds.length > 1 && <span className={styles.primary}>primary</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
