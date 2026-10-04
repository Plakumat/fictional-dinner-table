// Cuisine illustrations for the prototype: inline stroke icons, tinted tiles.
// The data has no photos, so a cuisine gets a drawing and a colour of its own.

const PATHS: Record<string, string> = {
  pizza: 'M3 20L12 3c4 1 7 4 9 8z M10 12h.01 M14 15h.01 M8 16h.01',
  burger: 'M4 10a8 5 0 0116 0z M3 13h18 M4 16h16a2 3 0 01-3 4H7a2 3 0 01-3-4z',
  kebab: 'M5 3v18 M5 6c4-1 8 1 12 0 M5 11c4-1 8 1 12 0 M5 16c4-1 8 1 12 0',
  fish: 'M3 12c4-6 14-6 18 0-4 6-14 6-18 0z M21 12l-4-4m4 4l-4 4 M8 12h.01',
  sushi: 'M12 20a8 8 0 100-16 8 8 0 000 16z M8 12a4 4 0 008 0 M9 9h.01 M15 9h.01',
  leaf: 'M4 20c0-8 6-14 16-16-1 10-7 16-16 16z M4 20c4-5 8-8 12-11',
  cupcake: 'M6 10h12l-1.5 10h-9z M8 10a4 4 0 018 0 M12 5v.01',
  cup: 'M5 10h11v6a4 4 0 01-4 4H9a4 4 0 01-4-4z M16 12h2a2 2 0 010 4h-2 M8 3v3 M11 3v3',
  bowl: 'M3 12h18a9 9 0 01-18 0z M8 4l1 6 M14 4l-1 6',
  plate: 'M12 21a9 9 0 100-18 9 9 0 000 18z M12 16a4 4 0 100-8 4 4 0 000 8z',
};

export interface CuisineLook {
  icon: keyof typeof PATHS;
  tint: string;
  ink: string;
}

const LOOKS: Record<string, CuisineLook> = {
  Italian: { icon: 'pizza', tint: 'var(--accent-tint)', ink: 'var(--accent)' },
  'Fast Food': { icon: 'burger', tint: 'var(--saffron-tint)', ink: 'var(--saffron-ink)' },
  Turkish: { icon: 'kebab', tint: 'var(--olive-tint)', ink: 'var(--olive)' },
  Seafood: { icon: 'fish', tint: 'var(--sky-tint)', ink: 'var(--sky-ink)' },
  Japanese: { icon: 'sushi', tint: 'var(--accent-tint)', ink: 'var(--accent)' },
  Vegan: { icon: 'leaf', tint: 'var(--olive-tint)', ink: 'var(--olive)' },
  Dessert: { icon: 'cupcake', tint: 'var(--saffron-tint)', ink: 'var(--saffron-ink)' },
  Breakfast: { icon: 'cup', tint: 'var(--saffron-tint)', ink: 'var(--saffron-ink)' },
  Asian: { icon: 'bowl', tint: 'var(--sky-tint)', ink: 'var(--sky-ink)' },
};

export const cuisineLook = (cuisine: string | undefined): CuisineLook =>
  (cuisine && LOOKS[cuisine]) || { icon: 'plate', tint: 'var(--linen)', ink: 'var(--ink-muted)' };

export function Food({ icon, color, size = 24 }: { icon: keyof typeof PATHS; color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[icon]} />
    </svg>
  );
}

export const Logo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect x="6" y="6" width="20" height="20" rx="6" transform="rotate(45 16 16)" fill="#B42318" />
    <circle cx="16" cy="16" r="6.5" fill="#FFFFFF" />
    <circle cx="16" cy="16" r="2.4" fill="#3F6B3A" />
  </svg>
);

/** Category tiles on the home screen. Each one sends the message the mock understands. */
export const CATEGORIES: { label: string; icon: keyof typeof PATHS; message: string }[] = [
  { label: 'Pizza', icon: 'pizza', message: 'Is there a pizza place near me?' },
  { label: 'Burger', icon: 'burger', message: 'Is there a burger place near me?' },
  { label: 'Kebab', icon: 'kebab', message: 'Is there a kebab place near me?' },
  { label: 'Seafood', icon: 'fish', message: 'Is there a seafood place near me?' },
  { label: 'Sushi', icon: 'sushi', message: 'Is there a sushi place near me?' },
  { label: 'Vegan', icon: 'leaf', message: 'Is there a vegan place near me?' },
  { label: 'Dessert', icon: 'cupcake', message: 'Is there a dessert place near me?' },
  { label: 'Breakfast', icon: 'cup', message: 'Is there a breakfast place near me?' },
];
