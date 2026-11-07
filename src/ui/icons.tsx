import type { ToolId } from '../game/park';

/** Simple original line icons for the build tools. */
const paths: Record<ToolId, string> = {
  inspect: 'M4 4l7 16 2.5-6.5L20 11z',
  raise: 'M3 19h18M6 19l6-11 6 11M12 3v4M9.5 5.5L12 3l2.5 2.5',
  lower: 'M3 5h18M6 5l6 11 6-11M12 21v-4M9.5 18.5L12 21l2.5-2.5',
  'water-up': 'M12 3c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10zM12 11v5M10 13l2-2 2 2',
  'water-down': 'M12 3c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10zM12 11v5M10 14l2 2 2-2',
  path: 'M8 21L10 3M16 21L14 3M12 6v2M12 11v2M12 16v2',
  'remove-path': 'M8 21L10 3M16 21L14 3M5 8l14 8M19 8L5 16',
  'buy-land': 'M4 20V9l8-5 8 5v11zM9 20v-6h6v6M12 9v.01',
  build: 'M3 21h18M5 21V11l7-7 7 7v10M9 21v-5h6v5M3 11l9-8 9 8',
  bin: 'M6 7h12M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  bench: 'M3 11h18M4 15h16M6 15v4M18 15v4M5 11V7h14v4',
  coaster: 'M2 18c3 0 4-12 8-12s3 8 6 8 3-4 6-4M5 19v-5M10 19V8M15 19v-5M20 19v-7',
};

export function ToolIcon({ tool }: { tool: ToolId }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={paths[tool]} />
    </svg>
  );
}

export function ManageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 20h16M6 16v-5M10 16V7M14 16v-7M18 16V4" />
    </svg>
  );
}

export function StaffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3a3 3 0 1 1 0 6a3 3 0 0 1 0-6zM6 21v-4a6 6 0 0 1 12 0v4M8 6h8" />
    </svg>
  );
}
