import identity from "./identity.json";

type Shape = typeof identity.symbol;
function Letterforms({ shape, className = "" }: { shape: Shape; className?: string }) {
  return (
    <svg
      className={className}
      viewBox={shape.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={shape.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shape.paths.map(({ id, d }) => (
        <path key={id} data-letter={id} d={d} />
      ))}
    </svg>
  );
}

/** Shared geometry keeps the website and editable SVG downloads identical. */
export function Mark({ className = "" }: { className?: string }) {
  return <Letterforms shape={identity.symbol} className={`cm-symbol ${className}`} />;
}

export function AppMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`cm-symbol cm-app-mark ${className}`}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
    >
      <rect className="cm-app-mark-bg" width="96" height="96" rx="22" fill="#102827" />
      <rect
        className="cm-app-mark-ring"
        x="1.5"
        y="1.5"
        width="93"
        height="93"
        rx="20.5"
        stroke="#8de0bf"
        strokeOpacity="0.22"
        strokeWidth="3"
      />
      <svg
        x="15"
        y="22.3"
        width="66"
        height="51.4"
        viewBox={identity.symbol.viewBox}
        fill="none"
        stroke="#8de0bf"
        strokeWidth={identity.symbol.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {identity.symbol.paths.map(({ id, d }) => (
          <path key={id} data-letter={id} d={d} />
        ))}
      </svg>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <Letterforms shape={identity.wordmark} className={`cm-wordmark ${className}`} />;
}
