"use client";
import { useState } from "react";
import type { DashboardData } from "@/lib/types";

interface EmailPreviewScreenProps {
  data: DashboardData;
  onBack: () => void;
}

export default function EmailPreviewScreen({ data, onBack }: EmailPreviewScreenProps) {
  const { company, domains, targets, contacts, drafts } = data;
  const [activeIdx, setActiveIdx] = useState(0);
  const senderUser = company.name.split(" ")[0].toLowerCase();
  const fromAddr = domains[0] ? `${senderUser}@${domains[0].domain}` : `${senderUser}@outbound.io`;

  const allItems = drafts.length > 0 ? drafts : targets.map((t, i) => ({
    id: t.id,
    contact_id: "",
    target_company_id: t.id,
    from_email: fromAddr,
    subject: `${t.name} — propuesta personalizada`,
    body_text: `Hola,\n\nVi que ${t.name} ${t.score_rationale ?? "matchea perfecto con nuestro ICP"}.\n\n¿Te tiro 3 horarios esta semana para una demo de 15 minutos?\n\nSaludos,\n${company.name.split(" ")[0]}`,
    status: "draft",
  }));

  const currentItem = allItems[activeIdx];

  function getSubjectForIdx(i: number) {
    if (drafts[i]) return drafts[i].subject;
    const t = targets[i];
    if (!t) return "Email personalizado";
    const contact = contacts.find((c) => c.id === drafts[i]?.contact_id)?.full_name?.split(" ")[0] ?? t.name.split(" ")[0];
    const subjects = [
      `${contact} — primer feedback sobre ${company.name.split(" ")[0]}`,
      `${contact}, una idea para ${t.name}`,
      `90s sobre ${company.name.split(" ")[0]} · ${t.name}`,
      `${contact} — pregunta rápida`,
    ];
    return subjects[i % subjects.length] ?? subjects[0];
  }

  return (
    <div className="lp-screen-wrap fade-in">
      <div className="lp-toolbar">
        <button className="btn btn-ghost" onClick={onBack}>← Volver al dashboard</button>
        <div className="url-bar">
          <span className="lock">●</span>
          inbox.tm2.io / {fromAddr}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn">Editar tono global</button>
          <button className="btn btn-dark">Aprobar y enviar {allItems.length}</button>
        </div>
      </div>

      <div className="inbox-frame">
        <aside className="inbox-side">
          <div className="acc-pick">
            <span className="kicker">enviando desde</span>
            <div className="acc">{fromAddr}</div>
            <div className="acc-meta">
              <span className="rep-dot" /> reputación 92/100 · listo
            </div>
            {domains[1] && (
              <div className="acc-alt">alterna con: <b>{senderUser}@{domains[1].domain}</b></div>
            )}
          </div>
          <div className="inbox-folders">
            <div className="folder is-active"><span>Drafts pendientes</span><span className="count">{allItems.length}</span></div>
            <div className="folder"><span>Aprobados</span><span className="count">0</span></div>
            <div className="folder"><span>Enviados</span><span className="count">0</span></div>
            <div className="folder"><span>Replies</span><span className="count">0</span></div>
          </div>
          <div className="inbox-list">
            {allItems.map((item, i) => {
              const t = targets[i] ?? targets[0];
              const initials = t ? t.name.split(" ").map((w) => w[0]).slice(0, 2).join("") : "??";
              const subj = getSubjectForIdx(i);
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
                      {t?.score != null && <span className="fit">{Math.round(t.score * 100)}</span>}
                    </div>
                    <div className="il-sub">{subj}</div>
                    <div className="il-pre">Hola…</div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="email-detail">
          {currentItem ? (
            <>
              <div className="ed-toolbar">
                <span className="kicker">draft #{activeIdx + 1} · personalizado</span>
                <div className="ed-btns">
                  <button className="btn btn-ghost btn-sm">Regenerar</button>
                  <button className="btn btn-sm">Aprobar</button>
                  <button className="btn btn-dark btn-sm">Enviar ahora</button>
                </div>
              </div>
              <div className="ed-head">
                <h1 className="ed-subj">{currentItem.subject}</h1>
                <div className="ed-meta">
                  <div className="row">
                    <span className="k">De</span>
                    <span className="v">{company.name} &lt;{fromAddr}&gt;</span>
                  </div>
                  <div className="row">
                    <span className="k">Para</span>
                    <span className="v">
                      {contacts[activeIdx]?.full_name ?? targets[activeIdx]?.name ?? "Prospect"}{" "}
                      &lt;{contacts[activeIdx]?.email ?? `contact@${targets[activeIdx]?.domain ?? "example.com"}`}&gt;
                    </span>
                  </div>
                  {targets[activeIdx] && (
                    <div className="row">
                      <span className="k">Empresa</span>
                      <span className="v">{targets[activeIdx].name} · {targets[activeIdx].industry ?? "—"} · {targets[activeIdx].location ?? "—"}</span>
                    </div>
                  )}
                  {targets[activeIdx]?.score != null && (
                    <div className="row">
                      <span className="k">Fit score</span>
                      <span className="v"><span className="fit-pill">{Math.round((targets[activeIdx].score ?? 0) * 100)} / 100</span></span>
                    </div>
                  )}
                </div>
              </div>
              <div className="ed-body">
                {currentItem.body_text.split("\n").map((p, i) => {
                  if (!p.trim()) return <div key={i} style={{ height: 6 }} />;
                  const toHighlight = [company.name, targets[activeIdx]?.name ?? "", targets[activeIdx]?.location ?? ""].filter(Boolean);
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
              {targets[activeIdx]?.score_rationale && (
                <div className="ed-foot">
                  <div className="why">
                    <span className="kicker">por qué este draft</span>
                    <p>Anclamos el primer párrafo en <b>{targets[activeIdx].score_rationale}</b>.</p>
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
