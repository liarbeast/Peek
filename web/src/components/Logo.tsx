// Peek's logo: a cat peeking up from the bottom of a frame. A placeholder for
// now; the same drawing is in web/public/favicon.svg and assets/logo-*.svg.
export function Logo({ size = 24 }: { size?: number }) {
  const line = { stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        {...line}
        strokeWidth={2.5}
        d="M8.25 3.25h15.5a5 5 0 0 1 5 5v15.5a5 5 0 0 1-5 5H8.25a5 5 0 0 1-5-5V8.25a5 5 0 0 1 5-5M7.5 28.75V21a8.5 8.5 0 0 1 1.3-4.5L8.5 11l5.1 2.6a8.5 8.5 0 0 1 4.8 0L23.5 11l-.3 5.5a8.5 8.5 0 0 1 1.3 4.5v7.75"
      />
      <circle cx="12.5" cy="21" r="1.9" fill="currentColor" />
      <circle cx="19.5" cy="21" r="1.9" fill="currentColor" />
      <path fill="currentColor" d="M14.85 23h2.3a.4.4 0 0 1 .3.65l-1.15 1.25a.4.4 0 0 1-.6 0l-1.15-1.25a.4.4 0 0 1 .3-.65" />
      <path
        {...line}
        strokeWidth={1.5}
        d="M14.25 25.25a.9.9 0 0 0 1.75 0 .9.9 0 0 0 1.75 0M10.25 23.5 5.25 22.75M10.25 25.5l-4.75.75M21.75 23.5l5-.75M21.75 25.5l4.75.75"
      />
    </svg>
  );
}
