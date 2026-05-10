"use client";

interface TopbarProps {
  screen: string;
  companyName?: string | null;
  onLogoClick?: () => void;
}

export default function Topbar({ screen, companyName, onLogoClick }: TopbarProps) {
  const phases = [
    { id: "diagnostic", color: "var(--diagnostic)", label: "Diagnóstico" },
    { id: "domain",     color: "var(--domain)",     label: "Dominios" },
    { id: "dns",        color: "var(--dns)",         label: "DNS" },
    { id: "warmup",     color: "var(--warmup)",      label: "Warmup" },
    { id: "research",   color: "var(--research)",    label: "Research" },
  ];

  return (
    <header className="topbar">
      <div className="brand" onClick={onLogoClick} style={{ cursor: onLogoClick ? "pointer" : "default" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="TakeMe2Market" style={{ height: 36, display: "block" }} />
      </div>

      {(screen === "stage" || screen === "dashboard" || screen === "emailPreview") && companyName && (
        <div className="topbar-nav">
          {phases.map((p) => (
            <div key={p.id} className="nav-pill">
              <span className="dot" style={{ background: p.color }} />
              {p.label}
            </div>
          ))}
        </div>
      )}

      <div className="topbar-right">
        {companyName && (
          <span style={{ fontSize: 13, color: "var(--fg-2)", fontFamily: "var(--mono)" }}>
            {companyName}
          </span>
        )}
        <span
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "var(--bg-3)", border: "1px solid var(--line)",
            display: "grid", placeItems: "center",
            fontSize: 13, color: "var(--fg-2)",
          }}
        >
          E
        </span>
      </div>
    </header>
  );
}
