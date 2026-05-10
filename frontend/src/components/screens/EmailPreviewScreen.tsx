"use client";
import { useState } from "react";
import type { DashboardData, EmailDraftOut, TargetCompanyOut, ContactOut } from "@/lib/types";
import { approveDrafts, sendCampaign } from "@/lib/api";

interface EmailPreviewScreenProps {
  data: DashboardData;
  onBack: () => void;
}

export default function EmailPreviewScreen({ data, onBack }: EmailPreviewScreenProps) {
  const { company, domains, targets, contacts, drafts, campaignId } = data;
  const [activeIdx, setActiveIdx] = useState(0);
  const [approveStatus, setApproveStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [sendStatus, setSendStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  // ── helpers para email addresses reales ──────────────────────────────
  const primaryFromEmail =
    domains[0]?.warmup_email ?? `outbound@${domains[0]?.domain ?? "outbound.io"}`;
  const altFromEmail =
    domains[1]?.warmup_email ?? (domains[1] ? `outbound@${domains[1].domain}` : null);

  // ── construir la lista de ítems con joins por ID ─────────────────────
  // Si hay drafts, usar drafts. Si no, construir placeholders desde targets.
  const allItems: (EmailDraftOut & { _target?: TargetCompanyOut; _contact?: ContactOut })[] =
    drafts.length > 0
      ? drafts.map(d => ({
          ...d,
          _target: targets.find(t => t.id === d.target_company_id),
          _contact: contacts.find(c => c.id === d.contact_id),
        }))
      : targets.map(t => {
          const contact = contacts.find(c => c.target_company_id === t.id);
          return {
            id: t.id,
            contact_id: contact?.id ?? "",
            target_company_id: t.id,
            from_email: primaryFromEmail,
            subject: `${t.name} — propuesta personalizada`,
            body_text: [
              `Hola${contact?.full_name ? " " + contact.full_name.split(" ")[0] : ""},`,
              "",
              `Construimos ${company.name} pensando en empresas como ${t.name}. ${t.score_rationale ?? "Matchea perfecto con el perfil de clientes que más valoramos."}`,
              "",
              "¿Tenés 15 minutos esta semana para una demo rápida?",
              "",
              `Saludos,\n${company.name.split(" ")[0]}`,
              "",
              "%unsubscribe_url%",
            ].join("\n"),
            status: "draft",
            personalization_notes: t.score_rationale ?? null,
            _target: t,
            _contact: contact,
          };
        });

  const current = allItems[activeIdx];
  const currentTarget = current?._target;
  const currentContact = current?._contact;

  // ── acciones ─────────────────────────────────────────────────────────
  async function handleApproveAll() {
    if (!campaignId || approveStatus !== "idle") return;
    setApproveStatus("loading");
    try {
      await approveDrafts(campaignId, true);
      setApproveStatus("done");
    } catch {
      setApproveStatus("error");
    }
  }

  async function handleSendAll() {
    if (!campaignId || sendStatus !== "idle") return;
    // Asegurarse que primero estén aprobados
    if (approveStatus === "idle") await handleApproveAll();
    setSendStatus("loading");
    try {
      await sendCampaign(campaignId, false); // execute=false → modo seguro
      setSendStatus("done");
    } catch {
      setSendStatus("error");
    }
  }

  // ── label del botón "Aprobar y enviar" ───────────────────────────────
  const approveLabel =
    approveStatus === "loading" ? "Aprobando…"
    : approveStatus === "done" ? "Aprobados ✓"
    : approveStatus === "error" ? "Error al aprobar"
    : `Aprobar y enviar ${allItems.length}`;

  const sendLabel =
    sendStatus === "loading" ? "Enviando…"
    : sendStatus === "done" ? "Enviados ✓"
    : sendStatus === "error" ? "Error al enviar"
    : "Enviar ahora";

  return (
    <div className="lp-screen-wrap fade-in">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="lp-toolbar">
        <button className="btn btn-ghost" onClick={onBack}>← Volver al dashboard</button>
        <div className="url-bar">
          <span className="lock">●</span>
          outbox · {company.name}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-dark"
            onClick={handleApproveAll}
            disabled={approveStatus !== "idle" || !campaignId}
          >
            {approveLabel}
          </button>
        </div>
      </div>

      <div className="inbox-frame">
        {/* ── Sidebar ───────────────────────────────────────────────── */}
        <aside className="inbox-side">
          {/* Cuenta de envío */}
          <div className="acc-pick">
            <span className="kicker">enviando desde</span>
            <div className="acc">{primaryFromEmail}</div>
            <div className="acc-meta">
              <span className="rep-dot" />
              {domains.length > 0 ? `${domains.length} dominio${domains.length > 1 ? "s" : ""} · warmup en curso` : "warmup en curso"}
            </div>
            {altFromEmail && (
              <div className="acc-alt">alterna con: <b>{altFromEmail}</b></div>
            )}
          </div>

          {/* Folders */}
          <div className="inbox-folders">
            <div className="folder is-active">
              <span>Drafts pendientes</span>
              <span className="count">{allItems.length}</span>
            </div>
            <div className="folder">
              <span>Aprobados</span>
              <span className="count">{approveStatus === "done" ? allItems.length : 0}</span>
            </div>
            <div className="folder">
              <span>Enviados</span>
              <span className="count">{sendStatus === "done" ? allItems.length : 0}</span>
            </div>
            <div className="folder">
              <span>Replies</span>
              <span className="count">0</span>
            </div>
          </div>

          {/* Lista de emails */}
          <div className="inbox-list">
            {allItems.map((item, i) => {
              const t = item._target;
              const c = item._contact;
              const initials = t
                ? t.name.split(" ").map(w => w[0]).slice(0, 2).join("")
                : "??";
              return (
                <button
                  key={item.id}
                  className={`il-row ${i === activeIdx ? "is-active" : ""}`}
                  onClick={() => setActiveIdx(i)}
                >
                  <span className="il-mark">{initials}</span>
                  <div className="il-mid">
                    <div className="il-top">
                      <span className="who">{t?.name ?? "Prospect"}</span>
                      {t?.score != null && (
                        <span className="fit">{Math.round(t.score * 100)}</span>
                      )}
                    </div>
                    <div className="il-sub">{item.subject}</div>
                    <div className="il-pre">
                      {c?.full_name
                        ? `→ ${c.full_name}${c.title ? ` · ${c.title}` : ""}`
                        : item.body_text.slice(0, 50) + "…"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Panel de email ────────────────────────────────────────── */}
        <main className="email-detail">
          {current ? (
            <>
              <div className="ed-toolbar">
                <span className="kicker">draft #{activeIdx + 1} de {allItems.length} · personalizado</span>
                <div className="ed-btns">
                  <button
                    className="btn btn-dark btn-sm"
                    onClick={handleSendAll}
                    disabled={sendStatus !== "idle" || !campaignId}
                  >
                    {sendLabel}
                  </button>
                </div>
              </div>

              <div className="ed-head">
                <h1 className="ed-subj">{current.subject}</h1>
                <div className="ed-meta">
                  {/* De */}
                  <div className="row">
                    <span className="k">De</span>
                    <span className="v">{company.name} &lt;{current.from_email ?? primaryFromEmail}&gt;</span>
                  </div>

                  {/* Para */}
                  <div className="row">
                    <span className="k">Para</span>
                    <span className="v" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>
                        {currentContact?.full_name ?? currentTarget?.name ?? "Prospect"}
                        {currentContact?.title && (
                          <span style={{ color: "var(--fg-2)", fontWeight: 400 }}> · {currentContact.title}</span>
                        )}
                        {" "}&lt;{currentContact?.email ?? `contacto@${currentTarget?.domain ?? "—"}`}&gt;
                      </span>
                      {currentContact?.linkedin_url && (
                        <a
                          href={currentContact.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 11,
                            color: "var(--fg-3)",
                            textDecoration: "underline",
                            whiteSpace: "nowrap",
                          }}
                        >
                          LinkedIn →
                        </a>
                      )}
                    </span>
                  </div>

                  {/* Empresa */}
                  {currentTarget && (
                    <div className="row">
                      <span className="k">Empresa</span>
                      <span className="v" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>
                          {currentTarget.name}
                          {currentTarget.industry && ` · ${currentTarget.industry}`}
                          {currentTarget.location && ` · ${currentTarget.location}`}
                          {currentTarget.size_range && ` · ${currentTarget.size_range} emp.`}
                        </span>
                        {currentTarget.evidence_url && (
                          <a
                            href={currentTarget.evidence_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, color: "var(--fg-3)", textDecoration: "underline" }}
                          >
                            fuente →
                          </a>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Fit score */}
                  {currentTarget?.score != null && (
                    <div className="row">
                      <span className="k">Fit score</span>
                      <span className="v">
                        <span className="fit-pill">{Math.round((currentTarget.score ?? 0) * 100)} / 100</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Cuerpo del email */}
              <div className="ed-body">
                {current.body_text.split("\n").map((p, i) => {
                  if (!p.trim()) return <div key={i} style={{ height: 6 }} />;
                  const toHighlight = [
                    company.name,
                    currentTarget?.name ?? "",
                    currentTarget?.location ?? "",
                  ].filter(Boolean);
                  let nodes: (string | JSX.Element)[] = [p];
                  toHighlight.forEach((phrase, j) => {
                    const next: (string | JSX.Element)[] = [];
                    for (const n of nodes) {
                      if (typeof n !== "string") { next.push(n); continue; }
                      const idx = n.indexOf(phrase);
                      if (idx === -1) { next.push(n); continue; }
                      next.push(n.slice(0, idx));
                      next.push(<mark key={`${i}-${j}`} className="hl hl-research">{phrase}</mark>);
                      next.push(n.slice(idx + phrase.length));
                    }
                    nodes = next;
                  });
                  return <p key={i}>{nodes}</p>;
                })}
              </div>

              {/* Por qué este prospect */}
              {(current.personalization_notes ?? currentTarget?.score_rationale) && (
                <div className="ed-foot">
                  <div className="why">
                    <span className="kicker">por qué este prospect</span>
                    <p>
                      {current.personalization_notes ?? currentTarget?.score_rationale}
                    </p>
                    {currentTarget?.evidence_url && (
                      <a
                        href={currentTarget.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11.5, color: "var(--fg-3)", textDecoration: "underline" }}
                      >
                        Ver fuente →
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 40, color: "var(--fg-2)", fontFamily: "var(--mono)", fontSize: 13 }}>
              Seleccioná un draft de la izquierda.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
