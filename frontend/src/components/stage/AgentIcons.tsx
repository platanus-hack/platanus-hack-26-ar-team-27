export function IconDiagnostic() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/><path d="M8 11h6M11 8v6"/>
    </svg>
  );
}
export function IconDomain() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 3 4 6 4 9s-1.5 6-4 9c-2.5-3-4-6-4-9s1.5-6 4-9z"/>
    </svg>
  );
}
export function IconDNS() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/>
      <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>
    </svg>
  );
}
export function IconWarmup() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c1.8 2.4 3 4.5 3 6.5a3 3 0 0 1-6 0c0-2 1.2-4.1 3-6.5z"/>
      <path d="M5 16c0 3.5 3 5 7 5s7-1.5 7-5"/>
    </svg>
  );
}
export function IconResearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>
    </svg>
  );
}

export type AgentName = "diagnostic" | "domain" | "dns" | "warmup" | "research";

export const AGENT_ICONS: Record<AgentName, () => JSX.Element> = {
  diagnostic: IconDiagnostic,
  domain: IconDomain,
  dns: IconDNS,
  warmup: IconWarmup,
  research: IconResearch,
};

export const AGENT_LABELS: Record<AgentName, string> = {
  diagnostic: "Diagnóstico",
  domain: "Dominios",
  dns: "DNS",
  warmup: "Warmup",
  research: "Research & Send",
};

export const AGENT_ROLES: Record<AgentName, string> = {
  diagnostic: "Lectura del pitch · ICP · plan",
  domain: "Compra · cap $4 · 2 dominios",
  dns: "MX · SPF · DKIM · DMARC",
  warmup: "Ping-pong · reputación 0→90",
  research: "Targets · drafts · envíos",
};

export const AGENT_LIST: AgentName[] = ["diagnostic", "domain", "dns", "warmup", "research"];
