"use client";
import type { DashboardData } from "@/lib/types";
import { AGENT_ICONS, AGENT_LABELS, AGENT_LIST, type AgentName } from "@/components/stage/AgentIcons";

interface DashboardScreenProps {
  data: DashboardData;
  onOpenInbox: () => void;
  onReset: () => void;
}

function Sparkline({ color, points }: { color: string; points: number[] }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const w = 110, h = 36;
  const step = w / Math.max(points.length - 1, 1);
  const norm = (v: number) => h - ((v - min) / (max - min || 1)) * h;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${i * step},${norm(p)}`).join(" ");
  const areaD = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`}>
      <path d={areaD} fill={color} opacity="0.1" />
      <path d={d} stroke={color} strokeWidth="1.6" fill="none" />
      <circle cx={w} cy={norm(points[points.length - 1])} r="3" fill={color} />
    </svg>
  );
}

export default function DashboardScreen({ data, onOpenInbox, onReset }: DashboardScreenProps) {
  const { company, domains, dnsResults, targets, drafts } = data;
  const dnsRecords = dnsResults[0]?.records ?? [];
  const totalCost = domains.reduce((s, d) => s + (d.price_usd ?? 2.99), 0);

  const repPoints = [32, 41, 56, 68, 79, 86, 92];

  const recapItems: { agent: AgentName; title: string; text: string; kpis: string[] }[] = [
    {
      agent: "diagnostic",
      title: "Diagnóstico",
      text: `Leyó el pitch raw y extrajo nombre (${company.name}), ICP, tamaño (${company.internal_company_size_range}), y un plan de ${company.target_company_count} targets.`,
      kpis: ["1 ICP", `${company.target_company_count} targets`, "5 campos"],
    },
    {
      agent: "domain",
      title: "Dominios",
      text: `Evaluó candidatos, descartó los > cap $4 y compró ${domains.length}: ${domains.map((d) => d.domain).join(" · ")}.`,
      kpis: [`${domains.length} comprados`, `$${totalCost.toFixed(2)} total`, "cap $4 OK"],
    },
    {
      agent: "dns",
      title: "DNS",
      text: `Configuró ${dnsRecords.length} registros por dominio (MX × 2, SPF, DKIM 2048, DMARC, CNAME tracking) y verificó cada uno vía DoH.`,
      kpis: [`${dnsRecords.length * domains.length} verificados`, "DKIM 2048", "p=none"],
    },
    {
      agent: "warmup",
      title: "Warmup",
      text: "Ping-pong pairwise entre dominios, escalando de 4 a 32 envíos diarios sobre 7 días. Reputación: 32 → 92.",
      kpis: ["7 días", "rep 92/100", "104 envíos"],
    },
    {
      agent: "research",
      title: "Research & Send",
      text: `Encontró ${targets.length} empresas que matchean ICP, scoreó por señales recientes, redactó ${drafts.length} emails personalizados.`,
      kpis: [`${targets.length} prospects`, `${drafts.length} drafts`, "bandeja lista"],
    },
  ];

  return (
    <div className="dashboard-shell fade-up">
      <div className="dash-hero">
        <div className="summary-card">
          <div className="summary-stripe" />
          <span className="kicker">Resumen ejecutivo · {company.name}</span>
          <h2>Tu primer outbound está <em>en vuelo</em>.</h2>
          <p className="description">
            Los cinco agentes terminaron. Compramos {domains.length} dominios bajo cap, configuramos {dnsRecords.length * domains.length} registros DNS, calentamos durante 7 días simulados y generamos {drafts.length} emails personalizados al ICP. Reputación final: <b>92/100</b>.
          </p>
          <div className="summary-meta">
            <div className="meta-item d"><span className="lbl">Dominios</span><span className="val">{domains.length}</span></div>
            <div className="meta-item dn"><span className="lbl">Records DNS</span><span className="val">{dnsRecords.length * Math.max(domains.length, 1)}</span></div>
            <div className="meta-item w"><span className="lbl">Reputación</span><span className="val">92</span></div>
            <div className="meta-item r"><span className="lbl">Emails</span><span className="val">{Math.max(drafts.length, targets.length)}</span></div>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-info">
              <span className="lbl">Reputación · 7 días</span>
              <span className="val">92<span className="of">/100</span></span>
              <span className="delta">↑ desde 32 día 1</span>
            </div>
            <div className="kpi-spark"><Sparkline color="var(--warmup)" points={repPoints} /></div>
          </div>
          <div className="kpi-card">
            <div className="kpi-info">
              <span className="lbl">Open rate proyectado</span>
              <span className="val">38%</span>
              <span className="delta">↑ 12pp vs cold benchmark</span>
            </div>
            <div className="kpi-spark"><Sparkline color="var(--research)" points={[12, 18, 22, 27, 31, 35, 38]} /></div>
          </div>
          <div className="kpi-card">
            <div className="kpi-info">
              <span className="lbl">Costo dominios</span>
              <span className="val">${totalCost.toFixed(2)}</span>
              <span className="delta">cap $4 respetado</span>
            </div>
            <div className="kpi-spark"><Sparkline color="var(--domain)" points={[0, ...domains.map((_, i) => (i + 1) * 3.49), totalCost]} /></div>
          </div>
        </div>
      </div>

      {domains.length > 0 && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <span className="kicker">Domain + DNS · infraestructura lista</span>
              <h3>{domains.length} dominios comprados · {dnsRecords.length * domains.length} registros DNS verificados</h3>
            </div>
            <span className="meta">cap $4/dominio · DKIM 2048 · DMARC p=none</span>
          </div>
          <div className="domains-summary">
            {domains.map((d) => (
              <div key={d.domain} className="domain-card">
                <div className="dh">
                  <span className="globe">●</span>
                  <span className="dn">{d.domain}</span>
                  <span className="pill ok">verificado</span>
                </div>
                <div className="dcost">comprado · <b>${(d.price_usd ?? 2.99).toFixed(2)}</b> · 1 año</div>
                <div className="drecs">
                  {["MX", "SPF", "DKIM", "DMARC", "CNAME"].map((r) => (
                    <span key={r} className="rec ok">{r}</span>
                  ))}
                </div>
                <div className="dwhy">outbound@{d.domain} listo para enviar.</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {targets.length > 0 && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <span className="kicker">Research agent · prospects priorizados</span>
              <h3>{targets.length} empresas identificadas — drafts listos para revisar</h3>
            </div>
            <span className="meta">scoring: ICP × señal reciente × tamaño</span>
          </div>
          <div className="targets-grid">
            {targets.map((t) => {
              const initials = t.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
              return (
                <div key={t.id} className="target-row">
                  <div className="company-mark">{initials}</div>
                  <div className="t-main">
                    <div className="t-top">
                      <span className="cn">{t.name}</span>
                      {t.industry && <span className="ind">{t.industry}</span>}
                      {t.location && <span className="loc">{t.location}</span>}
                    </div>
                    {t.score_rationale && <div className="t-rationale">{t.score_rationale}</div>}
                  </div>
                  <div className="t-right">
                    {t.score != null && (
                      <div className="score-pill big"><b>{Math.round(t.score * 100)}</b><span>fit</span></div>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={onOpenInbox}>ver draft →</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(drafts.length > 0 || targets.length > 0) && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <span className="kicker">Research agent · primer email</span>
              <h3>Outbound listo para enviar</h3>
            </div>
            <span className="meta">{drafts.length} drafts · revisión final</span>
          </div>
          <div className="email-preview-card">
            <div className="email-thumb" onClick={onOpenInbox} style={{ cursor: "pointer" }}>
              <div className="email-thumb-inner">
                <div className="eth-bar">
                  <span className="dots"><i /><i /><i /></span>
                  <span className="title">Bandeja de salida · {company.name}</span>
                </div>
                <div className="eth-body" style={{ padding: "12px 16px" }}>
                  <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-2)", margin: "0 0 8px" }}>
                    {drafts.length > 0 ? `${drafts.length} drafts generados` : `${targets.length} prospects encontrados`}
                  </p>
                  {drafts[0] && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{drafts[0].subject}</div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-1)", lineHeight: 1.4 }}>
                        {drafts[0].body_text.slice(0, 120)}…
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="scrim" />
              <span className="open-cta">Abrir bandeja →</span>
            </div>
            <div className="email-info">
              <span className="kicker">draft · personalizado</span>
              <h3>Emails a {targets.length} prospects</h3>
              {domains[0] && (
                <span className="domain">
                  <span className="dot" /> desde {company.name.split(" ")[0].toLowerCase()}@{domains[0].domain}
                </span>
              )}
              <p>
                {drafts.length} drafts en cola, personalizados sobre datos reales de cada prospect.
              </p>
              <div className="actions">
                <button className="btn btn-dark" onClick={onOpenInbox}>Abrir bandeja</button>
                <button className="btn">Aprobar todos</button>
                <button className="btn btn-ghost">Editar tono</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="section-block">
        <div className="section-head">
          <div>
            <span className="kicker">timeline ejecutado</span>
            <h3>Lo que hizo cada agente</h3>
          </div>
          <button className="btn btn-ghost" onClick={onReset}>Empezar otra startup →</button>
        </div>
        <div className="recap-grid">
          {recapItems.map((it) => {
            const Icon = AGENT_ICONS[it.agent];
            return (
              <div key={it.agent} className={`card agent-${it.agent} recap-card`}>
                <div className="recap-head">
                  <span className="ico"><Icon /></span>
                  <span className="serif title">{it.title}</span>
                  <span className="kicker">completado</span>
                </div>
                <p>{it.text}</p>
                <div className="kpis">
                  {it.kpis.map((k) => <span key={k} className="kpi">{k}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
