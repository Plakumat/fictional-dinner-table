import { useChat } from '../../app/AppContext';
import type { Confirmation } from '../../core/confirmation/machine';
import type { TranscriptItem } from '../../state/chatStore';
import styles from './inspector.module.css';

/**
 * The developer-facing view of every response: the audit record the server
 * sent, the phase the stream ended in, and everything the renderer refused to
 * draw and why. The product UI stays calm about a bad block; this is where the
 * details go.
 */
export function Inspector({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items = useChat((state) => state.items);
  const confirmations = useChat((state) => state.confirmations);
  const conversationId = useChat((state) => state.conversationId);
  const tokens = Object.values(confirmations);

  return (
    <aside id="inspector" className={styles.inspector} hidden={!open} aria-label="Audit inspector">
      <div className={styles.bar}>
        <h2 className={styles.heading}>Audit inspector</h2>
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.meta}>
        conversation <span className="mono">{conversationId ?? '(none yet)'}</span>
      </p>

      {items.length === 0 && <p className="muted">Nothing yet. Every response will be listed here with its audit record.</p>}

      <ol className={styles.entries}>
        {[...items].reverse().map((item) => (
          <Entry key={item.id} item={item} />
        ))}
      </ol>

      {tokens.length > 0 && (
        <section>
          <h3 className={styles.sub}>Confirmations</h3>
          <ul className={styles.tokens}>
            {tokens.map((c) => (
              <li key={c.token}>
                <span className="mono">{shortToken(c.token)}</span> {c.action} · <strong>{statusText(c)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

const shortToken = (token: string) => (token.length > 16 ? `${token.slice(0, 14)}…` : token);

const statusText = (c: Confirmation): string =>
  c.status.kind === 'rejected' ? `rejected (${c.status.code})` : c.status.kind === 'void' ? `void (${c.status.reason})` : c.status.kind;

function Entry({ item }: { item: TranscriptItem }) {
  const { response } = item;
  const audit = response.audit;
  const record = audit?.kind === 'valid' ? audit.audit : null;
  const phase = response.phase;

  return (
    <li className={styles.entry}>
      <p className={styles.entryTitle}>
        {item.kind === 'turn'
          ? item.userText
          : `execute ${item.action} → ${item.httpStatus === null ? 'recovered via status' : `HTTP ${item.httpStatus}`}`}
      </p>
      <dl className={styles.fields}>
        <Field term="decision" value={record?.decision ?? (audit ? 'invalid audit' : '(no audit received)')} strong />
        {record?.reason !== undefined && <Field term="reason" value={record.reason} />}
        {record?.intent !== undefined && <Field term="intent" value={record.intent} />}
        {record?.tools_called !== undefined && <Field term="tools_called" value={record.tools_called.join(', ') || '(none)'} />}
        {record?.kb_doc_ids !== undefined && <Field term="kb_doc_ids" value={record.kb_doc_ids.join(', ') || '(none)'} />}
        <Field
          term="phase"
          value={phase.kind === 'failed' ? `failed (${phase.code})` : phase.kind === 'incomplete' ? `incomplete (${phase.reason})` : phase.kind}
        />
        {response.meta && <Field term="request_id" value={response.meta.requestId} />}
      </dl>

      {response.issues.length > 0 && (
        <div className={styles.issues}>
          <p className={styles.issuesTitle}>Renderer: {response.issues.length} issue(s)</p>
          <ul>
            {response.issues.map((issue, i) => (
              <li key={i}>
                <span className={styles.issueKind}>{issue.kind}</span>
                {issue.index !== undefined && ` #${issue.index}`} — {issue.message}
                {issue.details && (
                  <ul className={styles.details}>
                    {issue.details.map((detail, j) => (
                      <li key={j} className="mono">
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {audit && (
        <details>
          <summary>Raw audit</summary>
          <pre className={styles.raw}>{JSON.stringify(audit.raw, null, 2)}</pre>
        </details>
      )}
    </li>
  );
}

const Field = ({ term, value, strong = false }: { term: string; value: string; strong?: boolean }) => (
  <div>
    <dt>{term}</dt>
    <dd>{strong ? <strong>{value}</strong> : value}</dd>
  </div>
);
