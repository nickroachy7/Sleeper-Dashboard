// A referee's whistle — the host's mark. Lucide has no whistle glyph, so this
// is a small hand-tuned SVG that matches the stroke weight of the lucide set
// (currentColor, 2px stroke) so it sits cleanly beside the other icons.
export function Whistle({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M13 8h7a1 1 0 0 1 1 1v2a5 5 0 0 1-5 5H10a5 5 0 0 1 0-10h3Z" />
      <circle cx="10" cy="11" r="2.4" />
      <path d="M13 8V6a2 2 0 0 0-2-2H8" />
    </svg>
  );
}
