/**
 * LogoMark — 4 hojas convergentes, una por agente.
 * Contrato de colores congelado: violet/fuchsia/cyan/emerald.
 */

type LogoMarkProps = {
  size?: number;
  mono?: boolean;
};

export function LogoMark({ size = 32, mono = false }: LogoMarkProps) {
  const c = {
    s: mono ? "#e6e7ee" : "rgb(167 139 250)",
    c: mono ? "#e6e7ee" : "rgb(232 121 249)",
    i: mono ? "#e6e7ee" : "rgb(34 211 238)",
    l: mono ? "#e6e7ee" : "rgb(52 211 153)",
  };

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="g-s" x1="32" y1="32" x2="32" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={c.s} stopOpacity="0.25" />
          <stop offset="1" stopColor={c.s} />
        </linearGradient>
        <linearGradient id="g-c" x1="32" y1="32" x2="58" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={c.c} stopOpacity="0.25" />
          <stop offset="1" stopColor={c.c} />
        </linearGradient>
        <linearGradient id="g-i" x1="32" y1="32" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={c.i} stopOpacity="0.25" />
          <stop offset="1" stopColor={c.i} />
        </linearGradient>
        <linearGradient id="g-l" x1="32" y1="32" x2="6" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={c.l} stopOpacity="0.25" />
          <stop offset="1" stopColor={c.l} />
        </linearGradient>
      </defs>
      <path d="M32 6 L36 30 L32 34 L28 30 Z" fill="url(#g-s)" />
      <path d="M58 32 L34 36 L30 32 L34 28 Z" fill="url(#g-c)" />
      <path d="M32 58 L28 34 L32 30 L36 34 Z" fill="url(#g-i)" />
      <path d="M6 32 L30 28 L34 32 L30 36 Z" fill="url(#g-l)" />
      <circle cx="32" cy="32" r="3.2" fill={mono ? "#e6e7ee" : "#f6f6fb"} />
    </svg>
  );
}
