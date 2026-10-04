import type { CSSProperties } from 'react';

// Skeletons: the shape of what is loading, at the size it will have, so the
// page does not jump when the data arrives. Each loading region also says
// "Loading" to a screen reader once, through a visually hidden sentence.

export function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

const stack = (gap: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap });

export const LoadingNote = ({ what }: { what: string }) => <span className="visually-hidden">Loading {what}…</span>;

/** A restaurant card: cover, title row, meta line, button. */
export function RestaurantCardSkeleton() {
  return (
    <div style={{ ...stack(0), width: '100%', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }} aria-hidden="true">
      <Skeleton height={120} radius={0} />
      <div style={{ ...stack(8), padding: '12px 14px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Skeleton width="55%" height={18} />
          <Skeleton width={48} height={20} radius={999} />
        </div>
        <Skeleton width="85%" height={12} />
        <Skeleton width={110} height={30} radius={999} />
      </div>
    </div>
  );
}

/** Lines of a cart: a restaurant row, two items, totals, a button. */
export function CartSkeleton() {
  return (
    <div style={stack(10)} aria-hidden="true">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Skeleton width={36} height={36} radius={10} />
        <Skeleton width="50%" height={16} />
      </div>
      <div style={{ ...stack(8), padding: '10px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <Skeleton width="70%" />
        <Skeleton width="60%" />
      </div>
      <Skeleton width="40%" />
      <Skeleton width="40%" />
      <Skeleton width="55%" height={22} />
      <Skeleton height={40} radius={12} />
    </div>
  );
}

/** Rows of an order list. */
export function OrderRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={stack(8)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ ...stack(6), padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Skeleton width="45%" height={16} />
            <Skeleton width={84} height={20} radius={999} />
          </div>
          <Skeleton width="70%" height={12} />
        </div>
      ))}
    </div>
  );
}

/** Help-center results. */
export function ResultsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={stack(10)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ ...stack(8), padding: '12px 16px', border: '1px solid var(--line)', borderRadius: 16 }}>
          <Skeleton width="50%" height={16} />
          <Skeleton width={120} height={20} radius={6} />
          <Skeleton width="92%" height={12} />
          <Skeleton width="70%" height={12} />
        </div>
      ))}
    </div>
  );
}

/** A document page: title, meta, body lines. */
export function DocSkeleton() {
  return (
    <div style={stack(10)} aria-hidden="true">
      <Skeleton width="60%" height={22} />
      <Skeleton width="35%" height={12} />
      <Skeleton width={160} height={20} radius={6} />
      <Skeleton width="100%" height={12} />
      <Skeleton width="96%" height={12} />
      <Skeleton width="88%" height={12} />
    </div>
  );
}
