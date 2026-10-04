// A small set of inline icons. They are decoration: every place that uses one
// also says the same thing in words, so nothing depends on recognising a glyph
// (or its colour).

const PATHS = {
  check: 'M4 12.5l5 5L20 6.5',
  cross: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  blocked: 'M5.6 5.6l12.8 12.8M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  alert: 'M12 9v4m0 3.5v.01M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  question: 'M9.2 9a3 3 0 115 2.2c-.9.7-2.2 1.3-2.2 2.8m0 3v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  retry: 'M4 12a8 8 0 0113.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.7L4 15.5M4 20v-4.5h4.5',
  stop: 'M7 7h10v10H7z',
  send: 'M4 12l16-8-6 16-3-7-7-1z',
  info: 'M12 11v6m0-9.5v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  replaced: 'M7 7h10l-3-3M17 17H7l3 3',
  home: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 7h16M4 12h16M4 17h16',
  cart: 'M3 5h2l2.5 11h11L21 8H7M9.5 20h.01M17 20h.01',
  back: 'M19 12H5M11 6l-6 6 6 6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  search: 'M20 20l-3.5-3.5M18 11a7 7 0 11-14 0 7 7 0 0114 0z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
