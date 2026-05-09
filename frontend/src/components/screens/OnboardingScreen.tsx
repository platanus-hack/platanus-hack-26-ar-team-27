"use client";
import { useState } from "react";
import type { CompanyOut } from "@/lib/types";
import { IconDiagnostic, IconDomain } from "@/components/stage/AgentIcons";

interface OnboardingScreenProps {
  company: CompanyOut;
  onConfirm: (payload: {
    company_name?: string;
    icp_description?: string;
    campaign_target_company_count?: number;
    internal_company_size_range?: string;
    suggested_domain_names?: string[];
  }) => void;
  onBack: () => void;
  isLoading: boolean;
}

export default function OnboardingScreen({ company, onConfirm, onBack, isLoading }: OnboardingScreenProps) {
  const [name, setName] = useState(company.name);
  const [icp, setIcp] = useState(company.icp_description ?? "");
  const [targetCount, setTargetCount] = useState(company.target_company_count);
  type SizeRange = "solo" | "2-10" | "11-50" | "51-200" | "201+" | "unknown";
  const [sizeRange, setSizeRange] = useState<SizeRange>((company.internal_company_size_range ?? "2-10") as SizeRange);

  const suggestedDomains = company.suggested_domain_names ?? [];
  const totalEstCost = suggestedDomains.slice(0, 2).length * 3.49;

  return (
    <div className="onboarding-shell fade-up">
      <div className="onb-head">
        <div>
          <span className="kicker">Paso 2 de 2 · Confirmá lo que detectamos</span>
          <h2>Esto leímos de tu pitch.</h2>
          <div className="sub">Si algo no te cierra, editalo. Si todo OK, lanzamos los 5 agentes.</div>
        </div>
        <button className="btn btn-ghost" onClick={onBack}>← Volver al input</button>
      </div>

      <div className="onb-grid">
        <div className="onb-panel">
          <header>
            <div className="ttl">
              <span className="ico"><IconDiagnostic /></span>
              Tu startup
            </div>
            <span className="kicker">editable</span>
          </header>
          <div className="body">
            <div className="row">
              <span className="k">Nombre</span>
              <input
                style={{ fontFamily: "var(--sans)", fontSize: 13, border: "1px solid var(--line)", borderRadius: 7, padding: "4px 8px", background: "var(--bg-1)", color: "var(--fg)", textAlign: "right" }}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <span className="k">ICP detectado</span>
              <textarea
                style={{ fontFamily: "var(--sans)", fontSize: 13, border: "1px solid var(--line)", borderRadius: 7, padding: "6px 8px", background: "var(--bg-1)", color: "var(--fg)", resize: "vertical", width: "100%" }}
                value={icp}
                onChange={(e) => setIcp(e.target.value)}
                rows={3}
              />
            </div>
            <div className="row">
              <span className="k">Target inicial</span>
              <input
                type="number"
                style={{ fontFamily: "var(--sans)", fontSize: 13, border: "1px solid var(--line)", borderRadius: 7, padding: "4px 8px", background: "var(--bg-1)", color: "var(--fg)", width: 80, textAlign: "right" }}
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
              />
            </div>
            <div className="row">
              <span className="k">Tamaño objetivo</span>
              <select
                style={{ fontFamily: "var(--sans)", fontSize: 13, border: "1px solid var(--line)", borderRadius: 7, padding: "4px 8px", background: "var(--bg-1)", color: "var(--fg)" }}
                value={sizeRange}
                onChange={(e) => setSizeRange(e.target.value as SizeRange)}
              >
                {["solo", "2-10", "11-50", "51-200", "201+"].map((s) => (
                  <option key={s} value={s}>{s} empleados</option>
                ))}
              </select>
            </div>
            {suggestedDomains.length > 0 && (
              <div className="row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
                <span className="k">Dominios sugeridos</span>
                <div className="tags-row">
                  {suggestedDomains.map((d) => (
                    <span key={d} className="tag domain">{d}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="row">
              <span className="k">Contexto</span>
              <span className="v" style={{ fontSize: 12, color: "var(--fg-2)", maxWidth: 280, textAlign: "right" }}>
                {company.business_context_summary?.slice(0, 100)}…
              </span>
            </div>
          </div>
        </div>

        <div className="onb-panel brief">
          <header>
            <div className="ttl">
              <span className="ico"><IconDomain /></span>
              Plan de los agentes
            </div>
            <span className="kicker">cap $4/dominio · warmup automático</span>
          </header>
          <div className="body">
            {[
              { tone: "diagnostic", n: "01", title: "Diagnóstico", desc: `Estructurar pitch en ICP + plan. Estimamos ${targetCount} prospects de tamaño ${sizeRange}.` },
              { tone: "domain", n: "02", title: "Compra de dominios · 2", desc: `Sugerencias: ${suggestedDomains.slice(0, 2).join(" · ")} · costo estimado $${totalEstCost.toFixed(2)}` },
              { tone: "dns", n: "03", title: "Configuración DNS", desc: "MX + SPF + DKIM + DMARC en ambos dominios. Verificación automática vía DoH." },
              { tone: "warmup", n: "04", title: "Warmup · 7 días", desc: "Ping-pong entre dominios. Reputación objetivo: 90/100. Acelerable con seed 1k cuentas." },
              { tone: "research", n: "05", title: "Research & Send", desc: `Encontrar 6 prospects high-fit, redactar emails personalizados, enviar al primer batch.` },
            ].map((step) => (
              <div key={step.n} className={`plan-step tone-${step.tone}`}>
                <span className="n">{step.n}</span>
                <div>
                  <b>{step.title}</b>
                  <p>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="onb-confirm">
        <div className="summary">
          <span className="a">Listo para lanzar 5 agentes en cadena</span>
          <span className="b">Diagnóstico → Dominios → DNS → Warmup → Research · podés ver todo en vivo</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={onBack}>← Volver</button>
          <button
            className="btn btn-dark"
            disabled={isLoading}
            onClick={() => onConfirm({
              company_name: name,
              icp_description: icp,
              campaign_target_company_count: targetCount,
              internal_company_size_range: sizeRange,
              suggested_domain_names: suggestedDomains,
            })}
          >
            {isLoading ? "Confirmando…" : "Iniciar agentes"} <span style={{ fontSize: 11, opacity: 0.7 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
