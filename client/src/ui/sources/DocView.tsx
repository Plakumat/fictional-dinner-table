import { classifyDoc, type DocSignals } from '../../core/kb/classifyDoc';
import { formatDay } from '../../core/format';
import type { KbDoc } from '../../api/queries';
import { Icon } from '../Icon';
import styles from './sources.module.css';

const AUTHORITY = {
  official: { label: 'Policy', hint: 'The rule itself.' },
  guidance: { label: 'Guidance', hint: 'Written by Sofra, but not the policy text.' },
  conversation: { label: 'Support conversation', hint: 'What one agent told one customer. Not policy, and it may be out of date.' },
} as const;

/** How far a document can be trusted, in words. Never by colour alone. */
export function TrustLabels({ doc, withHint = false }: { doc: DocSignals; withHint?: boolean }) {
  const trust = classifyDoc(doc);
  const authority = AUTHORITY[trust.authority];
  return (
    <div className={styles.trust}>
      <ul className={styles.labels}>
        <li className={styles.label} data-kind={trust.authority}>
          {authority.label}
        </li>
        {trust.archived && (
          <li className={styles.label} data-kind="archived">
            <Icon name="alert" size={13} /> Archived · no longer applies
          </li>
        )}
        {trust.undated && (
          <li className={styles.label} data-kind="undated">
            Undated
          </li>
        )}
      </ul>
      {withHint && <p className="muted">{authority.hint}</p>}
    </div>
  );
}

/** One help-center document. Its body is untrusted text and is rendered as text. */
export function DocView({ doc }: { doc: KbDoc }) {
  return (
    <article className={styles.doc}>
      <h2 className={styles.docTitle}>{doc.title}</h2>
      <p className="muted">
        <span className="mono">{doc.id}</span>
        {doc.date ? ` · ${formatDay(doc.date)}` : ' · no date'}
      </p>
      <TrustLabels doc={doc} withHint />
      <p className={styles.docBody}>{doc.body}</p>
    </article>
  );
}
