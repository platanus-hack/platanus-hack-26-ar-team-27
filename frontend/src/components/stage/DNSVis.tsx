"use client";
import type { DnsRecordOut } from "@/lib/types";

interface DNSVisProps {
  records: DnsRecordOut[];
  verifiedCount: number;
  domains: string[];
}

export default function DNSVis({ records, verifiedCount, domains }: DNSVisProps) {
  return (
    <div className="dns-vis">
      <div className="dns-domains">
        {domains.map((dom, di) => (
          <div key={dom} className="dns-card">
            <div className="dns-card-head">
              <span className="globe">●</span>
              <span className="dom">{dom}</span>
              <span className={`prog ${verifiedCount >= records.length ? "is-ready" : ""}`}>
                {Math.min(verifiedCount, records.length)}/{records.length}
              </span>
            </div>
            <div className="dns-rows">
              {records.map((r, i) => {
                const verified = i < verifiedCount;
                const checking = i === verifiedCount && di === 0;
                const noteMap: Record<string, string> = { SPF: "diagnostic", DKIM: "domain", DMARC: "dns", tracking: "warmup" };
                const noteTone = noteMap[r.record_type] ?? "research";
                return (
                  <div key={i} className={`dns-row ${verified ? "is-on" : ""} ${checking ? "is-checking" : ""}`}>
                    <span className={`type t-${r.record_type.toLowerCase()}`}>{r.record_type}</span>
                    <span className="host" title={r.host ?? ""}>{r.host}</span>
                    <span className="value" title={r.value}>{r.value}</span>
                    <span className="status">
                      {verified ? "✓ verificado" : checking ? "consultando…" : "pendiente"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
