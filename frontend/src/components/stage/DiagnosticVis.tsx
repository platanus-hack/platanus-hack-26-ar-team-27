"use client";
import type { CompanyOut } from "@/lib/types";

interface DiagnosticVisProps {
  company: CompanyOut;
  step: number;
  rawInput: string;
}

const AGENT_LIST = ["diagnostic", "domain", "dns", "warmup", "research"];

export default function DiagnosticVis({ company, step, rawInput }: DiagnosticVisProps) {
  const fields = [
    { k: "Nombre", v: company.name },
    { k: "ICP", v: company.icp_description ?? "—" },
    { k: "Tamaño objetivo", v: company.internal_company_size_range ?? "—" },
    { k: "Target count", v: `${company.target_company_count} empresas` },
    { k: "Contexto", v: company.business_context_summary ? company.business_context_summary.slice(0, 80) + "…" : "—" },
  ];

  function highlight(text: string, activeIdx: number) {
    const words = [company.name, ...(company.suggested_domain_names ?? []).slice(0, 3)];
    let chunks: (string | JSX.Element)[] = [text];
    words.slice(0, activeIdx + 1).forEach((phrase, j) => {
      if (!phrase) return;
      const next: (string | JSX.Element)[] = [];
      for (const chunk of chunks) {
        if (typeof chunk !== "string") { next.push(chunk); continue; }
        const idx = chunk.toLowerCase().indexOf(phrase.toLowerCase());
        if (idx === -1) { next.push(chunk); continue; }
        const tone = AGENT_LIST[j % 5];
        next.push(chunk.slice(0, idx));
        next.push(<mark key={`${j}-${idx}`} className={`hl hl-${tone}`}>{chunk.slice(idx, idx + phrase.length)}</mark>);
        next.push(chunk.slice(idx + phrase.length));
      }
      chunks = next;
    });
    return chunks;
  }

  return (
    <div className="diag-vis">
      <div className="diag-input">
        <div className="diag-label">Raw input · pitch</div>
        <div className="diag-text">{highlight(rawInput, step - 1)}</div>
      </div>
      <div className="diag-flow"><span /></div>
      <div className="diag-extracted">
        <div className="diag-label">Extracción estructurada</div>
        <div className="diag-fields">
          {fields.map((f, i) => {
            const visible = i < step;
            const tone = AGENT_LIST[i % 5];
            return (
              <div key={f.k} className={`diag-field tone-${tone} ${visible ? "is-on" : ""}`}>
                <span className="key">{f.k}</span>
                <span className="val">{visible ? f.v : "··"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
