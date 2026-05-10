"use client";
import { useState } from "react";
import type { CompanyOut } from "@/lib/types";
import type { ConfirmPayload } from "@/lib/api";
import { IconDiagnostic, IconDomain } from "@/components/stage/AgentIcons";

interface OnboardingScreenProps {
  company: CompanyOut;
  onConfirm: (payload: ConfirmPayload) => void;
  onBack: () => void;
  onEdit?: () => void;
  isLoading: boolean;
  confirmError?: string;
}

export default function OnboardingScreen({
  company,
  onConfirm,
  onBack,
  onEdit,
  isLoading,
  confirmError,
}: OnboardingScreenProps) {
  const [name, setName] = useState(company.name);
  const [icp, setIcp] = useState(company.icp_description ?? "");
  const [targetCount, setTargetCount] = useState(company.target_company_count);
  type SizeRange = "solo" | "2-10" | "11-50" | "51-200" | "201+" | "unknown";
  const [sizeRange, setSizeRange] = useState<SizeRange>((company.internal_company_size_range ?? "2-10") as SizeRange);
  const [countries, setCountries] = useState<string[]>(company.target_countries ?? []);
  const [countryDraft, setCountryDraft] = useState("");

  function addCountriesFromDraft() {
    const tokens = countryDraft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (tokens.length === 0) return;
    onEdit?.();
    setCountries((prev) => {
      const merged = [...prev];
      for (const t of tokens) {
        if (!merged.some((c) => c.toLowerCase() === t.toLowerCase())) merged.push(t);
      }
      return merged;
    });
    setCountryDraft("");
  }

  function removeCountry(value: string) {
    onEdit?.();
    setCountries((prev) => prev.filter((c) => c !== value));
  }

  const suggestedDomains = company.suggested_domain_names ?? [];
  const plannedDomains = suggestedDomains.slice(0, 2);
  const totalEstCost = plannedDomains.length * 3.49;
  const businessContextSummary = company.business_context_summary?.slice(0, 100);
  const domainPlanDescription =
    plannedDomains.length > 0
      ? `Sugerencias: ${plannedDomains.join(" · ")} · costo estimado $${totalEstCost.toFixed(2)}`
      : "Todavía no detectamos dominios sugeridos para outbound.";

  return (
    <div className="onboarding-shell fade-up">
      <div className="onb-head">
        <div>
          <span className="kicker">Paso 2 de 2 · Confirmá lo que detectamos</span>
          <h2>Esto leímos de tu pitch.</h2>
          <div className="sub">Si algo no te cierra, editalo. Si todo OK, lanzamos los 5 agentes.</div>
        </div>
        <button className="btn btn-ghost" onClick={onBack} disabled={isLoading}>← Volver al input</button>
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
                onChange={(e) => {
                  onEdit?.();
                  setName(e.target.value);
                }}
                disabled={isLoading}
              />
            </div>
            <div className="row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <span className="k">ICP detectado</span>
              <textarea
                style={{ fontFamily: "var(--sans)", fontSize: 13, border: "1px solid var(--line)", borderRadius: 7, padding: "6px 8px", background: "var(--bg-1)", color: "var(--fg)", resize: "vertical", width: "100%" }}
                value={icp}
                onChange={(e) => {
                  onEdit?.();
                  setIcp(e.target.value);
                }}
                disabled={isLoading}
                rows={3}
              />
            </div>
            <div className="row">
              <span className="k">Target inicial</span>
              <input
                type="number"
                style={{ fontFamily: "var(--sans)", fontSize: 13, border: "1px solid var(--line)", borderRadius: 7, padding: "4px 8px", background: "var(--bg-1)", color: "var(--fg)", width: 80, textAlign: "right" }}
                value={targetCount}
                onChange={(e) => {
                  onEdit?.();
                  setTargetCount(Number(e.target.value));
                }}
                disabled={isLoading}
              />
            </div>
            <div className="row">
              <span className="k">Tamaño objetivo</span>
              <select
                style={{ fontFamily: "var(--sans)", fontSize: 13, border: "1px solid var(--line)", borderRadius: 7, padding: "4px 8px", background: "var(--bg-1)", color: "var(--fg)" }}
                value={sizeRange}
                onChange={(e) => {
                  onEdit?.();
                  setSizeRange(e.target.value as SizeRange);
                }}
                disabled={isLoading}
              >
                {["solo", "2-10", "11-50", "51-200", "201+"].map((s) => (
                  <option key={s} value={s}>{s} empleados</option>
                ))}
              </select>
            </div>
            <div className="row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
              <span className="k">Países objetivo</span>
              <div className="tags-row" style={{ width: "100%" }}>
                {countries.map((c) => (
                  <span
                    key={c}
                    className="tag"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => removeCountry(c)}
                      disabled={isLoading}
                      style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--fg-2)", padding: 0, fontSize: 12, lineHeight: 1 }}
                      aria-label={`Quitar ${c}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={countryDraft}
                  onChange={(e) => {
                    onEdit?.();
                    setCountryDraft(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addCountriesFromDraft();
                    }
                  }}
                  onBlur={addCountriesFromDraft}
                  placeholder={countries.length ? "Agregar otro…" : "Argentina, México, Brasil…"}
                  disabled={isLoading}
                  style={{ flex: 1, minWidth: 140, fontFamily: "var(--sans)", fontSize: 13, border: "1px solid var(--line)", borderRadius: 7, padding: "4px 8px", background: "var(--bg-1)", color: "var(--fg)" }}
                />
              </div>
              <span style={{ fontSize: 11, color: "var(--fg-2)" }}>
                Enter o coma para agregar. El research solo va a buscar prospects en estos países.
              </span>
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
                {businessContextSummary ? `${businessContextSummary}…` : "Sin resumen disponible."}
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
              { tone: "domain", n: "02", title: "Compra de dominios · 2", desc: domainPlanDescription },
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
          {confirmError && (
            <p className="attach-error" style={{ maxWidth: 320, alignSelf: "center" }}>
              {confirmError}
            </p>
          )}
          <button className="btn btn-ghost" onClick={onBack} disabled={isLoading}>← Volver</button>
          <button
            className="btn btn-dark"
            disabled={isLoading}
            onClick={() => {
              const draftTokens = countryDraft
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const finalCountries = [...countries];
              for (const t of draftTokens) {
                if (!finalCountries.some((c) => c.toLowerCase() === t.toLowerCase())) {
                  finalCountries.push(t);
                }
              }
              onConfirm({
                company_name: name,
                icp_description: icp,
                campaign_target_company_count: targetCount,
                internal_company_size_range: sizeRange,
                suggested_domain_names: suggestedDomains,
                target_countries: finalCountries,
              });
            }}
          >
            {isLoading ? "Confirmando…" : "Iniciar agentes"} <span style={{ fontSize: 11, opacity: 0.7 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
