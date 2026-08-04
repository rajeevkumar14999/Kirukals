/**
 * The one delete icon.
 *
 * Removing a shot, a line of budget, a costume change or a whole script used
 * to be an ✕ — the same mark the dialogs use to mean "close". Two very
 * different outcomes wearing one glyph is how somebody loses a day's work by
 * reaching for the thing that usually just puts a panel away. A bin says
 * destroy; an ✕ says dismiss. This is the bin, and it is the only one, so the
 * meaning stays the same everywhere it appears.
 */
export default function TrashIcon({ size = 14 }) {
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
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
