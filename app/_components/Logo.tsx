/** A glazed pot, drawn as two strokes: a body and a drip. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h10l-1 3c2.6 1.4 4 3.9 4 6.8C20 17.9 16.4 21 12 21s-8-3.1-8-8.2C4 9.9 5.4 7.4 8 6L7 3z" style={{ fill: "var(--accent)" }} />
      <path d="M5.2 10.5c1.7 1.3 3.2.6 4.3 1.8.9 1-.2 2.6 1 3.4 1.1.7 1.8-.9 3-.6 1.5.4 1.2 2.4 2.6 2.3 1.6-.1 2.2-2.4 3.6-3.2" style={{ fill: "none", stroke: "var(--bg)", strokeWidth: 1.6, strokeLinecap: "round" }} />
    </svg>
  );
}
