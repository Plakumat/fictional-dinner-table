import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './carousel.module.css';

interface Props {
  /** Accessible name of the row. */
  label: string;
  /** What is shown above the row, on the left; the buttons sit to its right. */
  heading?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}

/**
 * A row of cards that scrolls sideways.
 *
 * The Previous and Next buttons live in the bar above the row, next to its
 * heading, never on top of the cards. Swiping and the trackpad still work.
 * The scrollbar is hidden so that the row's height does not change when a
 * card more than fits; when everything fits, the buttons go invisible but
 * keep their place, so nothing around them moves.
 */
export function Carousel({ label, heading, note, children }: Props) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setEdges({ start: el.scrollLeft <= 1, end: Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth - 1 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [children]);

  const step = (direction: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const width = card ? card.getBoundingClientRect().width + 14 : el.clientWidth;
    el.scrollBy({ left: direction * width, behavior: 'smooth' });
  };

  const fits = edges.start && edges.end;

  return (
    <section className={styles.carousel} aria-label={label}>
      <div className={styles.bar}>
        <div className={styles.barText}>
          {heading}
          {note && <span className={styles.note}>{note}</span>}
        </div>
        <div className={styles.arrows} data-hidden={fits}>
          <button type="button" className={styles.arrow} aria-label={`Previous: ${label}`} disabled={edges.start} onClick={() => step(-1)}>
            <Icon name="left" size={18} />
          </button>
          <button type="button" className={styles.arrow} aria-label={`Next: ${label}`} disabled={edges.end} onClick={() => step(1)}>
            <Icon name="right" size={18} />
          </button>
        </div>
      </div>
      <ul ref={track} className={styles.track}>
        {children}
      </ul>
    </section>
  );
}
