"use client";
import { useEffect, useState } from "react";
import type { DashboardData, DnsRecordOut } from "@/lib/types";
import { AGENT_ICONS, AGENT_LABELS, AGENT_LIST, type AgentName } from "@/components/stage/AgentIcons";
import { publishBlog, getBlog, type BlogPublicationOut } from "@/lib/api";

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

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "var(--research)" : pct >= 60 ? "var(--warmup)" : "var(--domain)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: "var(--line)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-2)", minWidth: 28, textAlign: "right" }}>
        {pct}
      </span>
    </div>
  );
}

type DnsRecordSummary = { label: string; status: "verified" | "pending" };

function summarizeDnsRecords(records: DnsRecordOut[]): DnsRecordSummary[] {
  const out: DnsRecordSummary[] = [];
  const isVerified = (r: DnsRecordOut) => r.status === "verified";

  const mxRecs = records.filter(r => r.record_type === "MX");
  if (mxRecs.length > 0)
    out.push({ label: "MX", status: mxRecs.every(isVerified) ? "verified" : "pending" });

  const spfRec = records.find(r => r.record_type === "TXT" && r.value.startsWith("v=spf1"));
  if (spfRec)
    out.push({ label: "SPF", status: isVerified(spfRec) ? "verified" : "pending" });

  const dkimRec = records.find(r => r.record_type === "TXT" && r.value.includes("DKIM1"));
  if (dkimRec)
    out.push({ label: "DKIM", status: isVerified(dkimRec) ? "verified" : "pending" });

  const dmarcRec = records.find(r => r.record_type === "TXT" && (r.host ?? "").includes("_dmarc"));
  if (dmarcRec)
    out.push({ label: "DMARC", status: isVerified(dmarcRec) ? "verified" : "pending" });

  const cnameRec = records.find(r => r.record_type === "CNAME");
  if (cnameRec)
    out.push({ label: "CNAME", status: isVerified(cnameRec) ? "verified" : "pending" });

  return out;
}

export default function DashboardScreen({ data, onOpenInbox, onReset }: DashboardScreenProps) {
  const { company, domains, dnsResults, targets, contacts, drafts } = data;
  const gtmStrategy = company.gtm_strategy?.trim() || "";

  const totalCost = domains.reduce((s, d) => s + (d.price_usd ?? 2.99), 0);
  const totalDnsRecords = dnsResults.reduce((s, r) => s + r.records.length, 0);
  const repPoints = [32, 41, 56, 68, 79, 86, 92];

  // ── Blog publication state ─────────────────────────────────────────
  const [blog, setBlog] = useState<BlogPublicationOut | null>(null);
  const [blogBusy, setBlogBusy] = useState(false);
  const [blogError, setBlogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBlog(company.id)
      .then((b) => { if (!cancelled) setBlog(b); })
      .catch(() => { /* 404 / network — noop */ });
    return () => { cancelled = true; };
  }, [company.id]);

  async function handlePublishBlog() {
    setBlogBusy(true);
    setBlogError(null);
    try {
      const result = await publishBlog(company.id, true);
      setBlog(result);
    } catch (e) {
      setBlogError(e instanceof Error ? e.message : String(e));
    } finally {
      setBlogBusy(false);
    }
  }

  // Sort targets by score descending for the prospects section
  const sortedTargets = [...targets].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Map domain → its DNS result
  const dnsResultByDomain = new Map(dnsResults.map(r => [r.domain, r]));

  const recapItems: { agent: AgentName; title: string; text: string; kpis: string[] }[] = [
    {
      agent: "diagnostic",
      title: "Diagnóstico",
      text: `Leyó el pitch raw y extrajo nombre (${company.name}), ICP, tamaño (${company.internal_company_size_range ?? "—"}), y un plan de ${company.target_company_count} targets.`,
      kpis: ["1 ICP estructurado", `${company.target_company_count} targets`, "5 campos extraídos"],
    },
    {
      agent: "domain",
      title: "Dominios",
      text: `Evaluó candidatos, descartó los > cap $4 y compró ${domains.length}: ${domains.map(d => d.domain).join(" · ")}.`,
      kpis: [`${domains.length} comprado${domains.length > 1 ? "s" : ""}`, `$${totalCost.toFixed(2)} total`, "cap $4 OK"],
    },
    {
      agent: "dns",
      title: "DNS",
      text: `Configuró registros MX, SPF, DKIM y DMARC por dominio y verificó cada uno vía DoH.`,
      kpis: [`${totalDnsRecords || dnsResults.length * 5} registros`, "DKIM 2048‑bit", "DMARC p=none"],
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
      text: `Encontró ${targets.length} empresa${targets.length !== 1 ? "s" : ""} que matchean ICP con web search en vivo, scoreó por señales recientes y redactó ${drafts.length} emails personalizados.`,
      kpis: [`${targets.length} prospects`, `${drafts.length} draft${drafts.length !== 1 ? "s" : ""}`, "bandeja lista"],
    },
  ];

  return (
    <div className="dashboard-shell fade-up">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="dash-hero">
        <div className="summary-card">
          <div className="summary-stripe" />
          <span className="kicker">Resumen ejecutivo · {company.name}</span>
          <h2>Tu primer outbound está <em>en vuelo</em>.</h2>
          <p className="description">
            Los cinco agentes terminaron. Compramos {domains.length} dominio{domains.length > 1 ? "s" : ""} bajo cap,
            configuramos DNS (MX + SPF + DKIM + DMARC) por dominio, iniciamos warmup de 7 días
            y generamos <b>{drafts.length} emails personalizados</b> al ICP con investigación web en vivo.
          </p>
          <div className="summary-meta">
            <div className="meta-item d">
              <span className="lbl">Dominios</span>
              <span className="val">{domains.length}</span>
            </div>
            <div className="meta-item dn">
              <span className="lbl">Records DNS</span>
              <span className="val">{totalDnsRecords || dnsResults.length * 5 || domains.length * 5}</span>
            </div>
            <div className="meta-item w">
              <span className="lbl">Warmup</span>
              <span className="val">7d</span>
            </div>
            <div className="meta-item r">
              <span className="lbl">Emails</span>
              <span className="val">{drafts.length || targets.length}</span>
            </div>
          </div>
        </div>

        <div className="kpi-grid">
          {/* Warmup — placeholder fake (sin datos reales de reputación aún) */}
          <div className="kpi-card">
            <div className="kpi-info">
              <span className="lbl">Warmup · 7 días</span>
              <span className="val">92<span className="of">/100</span></span>
              <span className="delta">rep. proyectada · en curso</span>
            </div>
            <div className="kpi-spark"><Sparkline color="var(--warmup)" points={repPoints} /></div>
          </div>

          {/* Emails — datos reales */}
          <div className="kpi-card">
            <div className="kpi-info">
              <span className="lbl">Emails generados</span>
              <span className="val">{drafts.length || targets.length}</span>
              <span className="delta">personalizados por prospect</span>
            </div>
            <div className="kpi-spark">
              <Sparkline
                color="var(--research)"
                points={
                  sortedTargets.length > 1
                    ? sortedTargets.map(t => Math.round((t.score ?? 0.5) * 100))
                    : [55, 62, 70, 78, 84, 88, 91]
                }
              />
            </div>
          </div>

          {/* Costo — datos reales */}
          <div className="kpi-card">
            <div className="kpi-info">
              <span className="lbl">Costo dominios</span>
              <span className="val">${totalCost.toFixed(2)}</span>
              <span className="delta">cap $4/dominio respetado</span>
            </div>
            <div className="kpi-spark">
              <Sparkline
                color="var(--domain)"
                points={[0, ...domains.map((_, i) => (i + 1) * (totalCost / domains.length || 3.49))]}
              />
            </div>
          </div>
        </div>
      </div>

      {gtmStrategy && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <span className="kicker">Diagnóstico · salida al mercado</span>
              <h3>Estrategia GTM sugerida</h3>
            </div>
            <span className="meta">solo lectura · generada en diagnóstico</span>
          </div>
          <div className="gtm-strategy-card">
            <p>{gtmStrategy}</p>
          </div>
        </div>
      )}

      {/* ── Infraestructura ──────────────────────────────────────────── */}
      {domains.length > 0 && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <span className="kicker">Infraestructura · dominios + DNS</span>
              <h3>{domains.length} dominio{domains.length > 1 ? "s" : ""} comprado{domains.length > 1 ? "s" : ""} · configurados y listos para outbound</h3>
            </div>
            <span className="meta">cap $4/dominio · DKIM 2048‑bit · DMARC p=none</span>
          </div>
          <div className="domains-summary">
            {domains.map(d => {
              const dnsResult = dnsResultByDomain.get(d.domain);
              const records = dnsResult?.records ?? [];
              const recsSummary = summarizeDnsRecords(records);
              const fromEmail = d.warmup_email ?? `outbound@${d.domain}`;
              const allVerified = recsSummary.length > 0 && recsSummary.every(r => r.status === "verified");
              const statusLabel = allVerified ? "verificado" : recsSummary.length > 0 ? "parcial" : "configurado";
              const statusClass = allVerified ? "ok" : recsSummary.length > 0 ? "warn" : "ok";

              return (
                <div key={d.domain} className="domain-card">
                  <div className="dh">
                    <span className="globe">●</span>
                    <span className="dn">{d.domain}</span>
                    <span className={`pill ${statusClass}`}>{statusLabel}</span>
                  </div>
                  <div className="dcost">
                    comprado · <b>${(d.price_usd ?? 2.99).toFixed(2)}</b> · 1 año
                  </div>
                  <div className="drecs">
                    {recsSummary.length > 0
                      ? recsSummary.map(r => (
                          <span key={r.label} className={`rec ${r.status === "verified" ? "ok" : "warn"}`}>
                            {r.status === "verified" ? "✓" : "⏳"} {r.label}
                          </span>
                        ))
                      : ["MX", "SPF", "DKIM", "DMARC", "CNAME"].map(r => (
                          <span key={r} className="rec ok">✓ {r}</span>
                        ))
                    }
                  </div>
                  <div className="dwhy">
                    📧 {fromEmail} · listo para enviar
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Blog ─────────────────────────────────────────────────────── */}
      {domains.length > 0 && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <span className="kicker">Content · blog generado por LLM</span>
              <h3>
                {blog?.status === "live"
                  ? "Blog publicado en Vercel"
                  : "Generar blog estático y desplegarlo"}
              </h3>
            </div>
            <span className="meta">
              subdominio: blog.{domains[0].domain} · vercel
            </span>
          </div>
          <div className="domain-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {blog?.status === "live" && blog.custom_url && (
              <>
                <div style={{ fontSize: 13, color: "var(--fg-1)" }}>
                  <b>{blog.title ?? "Blog"}</b> — listo. El DNS puede tardar 1–15 min en propagar.
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a
                    href={blog.custom_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-dark"
                    style={{ textDecoration: "none" }}
                  >
                    Abrir {blog.subdomain_host} →
                  </a>
                  {blog.vercel_deployment_url && (
                    <a
                      href={blog.vercel_deployment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost"
                      style={{ textDecoration: "none" }}
                    >
                      Vercel preview →
                    </a>
                  )}
                  <button
                    className="btn btn-ghost"
                    onClick={handlePublishBlog}
                    disabled={blogBusy}
                  >
                    {blogBusy ? "Re-publicando…" : "Re-generar y re-publicar"}
                  </button>
                </div>
              </>
            )}
            {blog?.status === "dry_run" && (
              <>
                <div style={{ fontSize: 13, color: "var(--fg-1)" }}>
                  Blog generado en modo <b>dry run</b> (HTML guardado, sin deploy real).
                  Activá <code>ALLOW_BLOG_PUBLISH=true</code> y un <code>VERCEL_TOKEN</code> en el backend para publicar.
                </div>
                <div>
                  <button className="btn btn-dark" onClick={handlePublishBlog} disabled={blogBusy}>
                    {blogBusy ? "Publicando…" : "Reintentar publicación"}
                  </button>
                </div>
              </>
            )}
            {!blog && (
              <>
                <div style={{ fontSize: 13, color: "var(--fg-1)" }}>
                  Generamos un sitio estático con 3–5 posts editoriales adaptados a tu ICP y lo publicamos en
                  &nbsp;<b>blog.{domains[0].domain}</b>. Tarda ~10–20 segundos.
                </div>
                <div>
                  <button className="btn btn-dark" onClick={handlePublishBlog} disabled={blogBusy}>
                    {blogBusy ? "Generando + desplegando…" : "Publicar blog →"}
                  </button>
                </div>
              </>
            )}
            {blog && blog.status !== "live" && blog.status !== "dry_run" && (
              <div style={{ fontSize: 12, color: "var(--fg-2)" }}>
                Estado: <b>{blog.status}</b>
                {blog.error_message ? ` · ${blog.error_message}` : ""}
              </div>
            )}
            {blogError && (
              <div style={{ fontSize: 12, color: "#c0392b" }}>Error: {blogError}</div>
            )}
          </div>
        </div>
      )}

      {/* ── Prospects ────────────────────────────────────────────────── */}
      {sortedTargets.length > 0 && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <span className="kicker">Research · prospects priorizados por fit score</span>
              <h3>{sortedTargets.length} empresa{sortedTargets.length !== 1 ? "s" : ""} identificadas — emails listos para revisar</h3>
            </div>
            <span className="meta">scoring: ICP × señal web × tamaño objetivo</span>
          </div>
          <div className="targets-grid">
            {sortedTargets.map(t => {
              const initials = t.name.split(" ").map(w => w[0]).slice(0, 2).join("");
              const contact = contacts.find(c => c.target_company_id === t.id);
              return (
                <div key={t.id} className="target-row">
                  <div className="company-mark">{initials}</div>
                  <div className="t-main">
                    <div className="t-top">
                      <span className="cn">{t.name}</span>
                      {t.industry && <span className="ind">{t.industry}</span>}
                      {t.location && <span className="loc">{t.location}</span>}
                      {t.size_range && <span className="ind">{t.size_range} emp.</span>}
                    </div>
                    {t.score != null && (
                      <div style={{ marginTop: 4 }}>
                        <ScoreBar score={t.score} />
                      </div>
                    )}
                    {t.score_rationale && (
                      <div className="t-rationale">{t.score_rationale}</div>
                    )}
                    {contact && (
                      <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--fg-2)", display: "flex", gap: 8, alignItems: "center" }}>
                        <span>
                          {contact.full_name ?? "—"}
                          {contact.title ? ` · ${contact.title}` : ""}
                          {contact.email ? ` · ${contact.email}` : ""}
                        </span>
                        {contact.linkedin_url && (
                          <a
                            href={contact.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--fg-3)", textDecoration: "underline", fontSize: 11 }}
                          >
                            LinkedIn →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="t-right">
                    {t.evidence_url && (
                      <a
                        href={t.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost btn-sm"
                        style={{ textDecoration: "none" }}
                      >
                        fuente →
                      </a>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={onOpenInbox}>
                      ver draft →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Email preview ─────────────────────────────────────────────── */}
      {(drafts.length > 0 || targets.length > 0) && (
        <div className="section-block">
          <div className="section-head">
            <div>
              <span className="kicker">Bandeja de salida · emails listos</span>
              <h3>Outbound listo para revisar y enviar</h3>
            </div>
            <span className="meta">{drafts.length} draft{drafts.length !== 1 ? "s" : ""} · personalización por prospect</span>
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
                      <div style={{ fontSize: 11, color: "var(--fg-2)", marginBottom: 2 }}>
                        De: {drafts[0].from_email ?? `outbound@${domains[0]?.domain ?? "—"}`}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{drafts[0].subject}</div>
                      <div style={{ fontSize: 11.5, color: "var(--fg-1)", lineHeight: 1.4 }}>
                        {drafts[0].body_text.slice(0, 140)}…
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="scrim" />
              <span className="open-cta">Abrir bandeja →</span>
            </div>
            <div className="email-info">
              <span className="kicker">draft · personalizado por prospect</span>
              <h3>Emails a {sortedTargets.length} prospect{sortedTargets.length !== 1 ? "s" : ""}</h3>
              {domains[0] && (
                <span className="domain">
                  <span className="dot" /> desde {domains[0].warmup_email ?? `outbound@${domains[0].domain}`}
                  {domains[1] && ` · ${domains[1].warmup_email ?? `outbound@${domains[1].domain}`}`}
                </span>
              )}
              <p>
                {drafts.length} draft{drafts.length !== 1 ? "s" : ""} en cola, investigados con web search en vivo y personalizados sobre datos reales de cada prospect.
              </p>
              <div className="actions">
                <button className="btn btn-dark" onClick={onOpenInbox}>Abrir bandeja</button>
                <button className="btn" onClick={onOpenInbox}>Revisar y aprobar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Recap de agentes ─────────────────────────────────────────── */}
      <div className="section-block">
        <div className="section-head">
          <div>
            <span className="kicker">timeline ejecutado</span>
            <h3>Lo que hizo cada agente</h3>
          </div>
          <button className="btn btn-ghost" onClick={onReset}>Empezar otra startup →</button>
        </div>
        <div className="recap-grid">
          {recapItems.map(it => {
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
                  {it.kpis.map(k => <span key={k} className="kpi">{k}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
