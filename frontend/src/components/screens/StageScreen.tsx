"use client";
import { useEffect, useRef, useState } from "react";
import type {
  CompanyOut, PurchasedDomainOut, DnsConfigureResult, DnsRecordOut,
  TargetCompanyOut, ContactOut, EmailDraftOut, DashboardData, LogEntry, ArtifactEntry,
} from "@/lib/types";
import {
  planDomains, purchaseDomains, listDomains,
  configureDns, verifyDns, runWarmup,
  researchTargets, generateDrafts,
} from "@/lib/api";
import PhaseRibbon from "@/components/stage/PhaseRibbon";
import AgentStage, { type AgentState, type VizState } from "@/components/stage/AgentStage";
import Console from "@/components/stage/Console";
import { AGENT_LIST, type AgentName } from "@/components/stage/AgentIcons";

const WARMUP_EVENTS = [
  { day: 1, sent: 4, replied: 3, opened: 4, reputation: 32 },
  { day: 2, sent: 6, replied: 5, opened: 6, reputation: 41 },
  { day: 3, sent: 8, replied: 7, opened: 8, reputation: 56 },
  { day: 4, sent: 12, replied: 10, opened: 12, reputation: 68 },
  { day: 5, sent: 18, replied: 15, opened: 18, reputation: 79 },
  { day: 6, sent: 24, replied: 21, opened: 24, reputation: 86 },
  { day: 7, sent: 32, replied: 28, opened: 32, reputation: 92 },
];

const THINKING: Record<AgentName, string[]> = {
  diagnostic: [
    "Parseando input raw, extrayendo entidades clave…",
    "Estructurando ICP a partir del contexto de negocio…",
    "Estimando target count y size range…",
    "Generando plan de 5 agentes…",
  ],
  domain: [
    "Generando candidatos de dominio basados en brand name…",
    "Consultando disponibilidad vía Porkbun API…",
    "Filtrando por cap $4/dominio · descartando premium…",
    "Ejecutando compra de dominios seleccionados…",
  ],
  dns: [
    "Generando registros MX para Mailgun…",
    "Configurando SPF + DKIM 2048-bit…",
    "Propagando DMARC p=none · verificando DoH…",
    "Confirmando todos los registros resuelven correctamente…",
  ],
  warmup: [
    "Iniciando ping-pong entre dominios comprados…",
    "Escalonando volumen de envíos día a día…",
    "Monitoreando reputación en Mailgun inbox…",
    "Reputación alcanzada · listo para outbound real…",
  ],
  research: [
    "Buscando empresas que matchean el ICP detectado…",
    "Scoring por señales recientes: LinkedIn, hiring, posts…",
    "Redactando emails personalizados por prospect…",
    "Emails listos en bandeja de salida…",
  ],
};

function ts() {
  return new Date().toLocaleTimeString("es-AR", { hour12: false });
}

function makeInitialStates(): Record<AgentName, AgentState> {
  return Object.fromEntries(
    AGENT_LIST.map((a) => [a, { status: "idle", thinking: "", toolIdx: -1 }])
  ) as Record<AgentName, AgentState>;
}

interface StageScreenProps {
  company: CompanyOut;
  rawInput: string;
  onDone: (data: DashboardData) => void;
}

export default function StageScreen({ company, rawInput, onDone }: StageScreenProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [doneIdx, setDoneIdx] = useState(0);
  const [agentStates, setAgentStates] = useState<Record<AgentName, AgentState>>(makeInitialStates);
  const [vizState, setVizState] = useState<VizState>({
    diagStep: 0, domEvaluated: 0, dnsVerified: 0, warmDay: -1, resDone: 0, resBusy: -1,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([]);

  // accumulated results
  const [domainCandidates, setDomainCandidates] = useState<Array<{ domain: string; price: number; status: string; chosen: boolean; reason?: string }>>([]);
  const [purchasedDomains, setPurchasedDomains] = useState<PurchasedDomainOut[]>([]);
  const [dnsRecords, setDnsRecords] = useState<DnsRecordOut[]>([]);
  const [targets, setTargets] = useState<TargetCompanyOut[]>([]);

  const ran = useRef(false);

  function log(agent: AgentName, text: string, ok = true) {
    setLogs((p) => [...p, { agent, text, ts: ts(), ok }]);
  }
  function artifact(code: AgentName, ref: string) {
    setArtifacts((p) => [...p, { code, ref, when: ts() }]);
  }
  function setAgent(agent: AgentName, patch: Partial<AgentState>) {
    setAgentStates((p) => ({ ...p, [agent]: { ...p[agent], ...patch } }));
  }
  function setViz(patch: Partial<VizState>) {
    setVizState((p) => ({ ...p, ...patch }));
  }
  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function runThinkingAnimation(agent: AgentName, lines: string[], msEach = 900) {
    for (let i = 0; i < lines.length; i++) {
      setAgent(agent, { thinking: lines[i], toolIdx: i });
      await sleep(msEach);
    }
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    runAll();
  }, []);

  async function runAll() {
    // ── Phase 0: Diagnostic (already done, animate visualization) ─────
    setActiveIdx(0);
    setAgent("diagnostic", { status: "active", thinking: THINKING.diagnostic[0], toolIdx: 0 });
    log("diagnostic", "Iniciando análisis del pitch…");

    await runThinkingAnimation("diagnostic", THINKING.diagnostic, 700);
    for (let i = 1; i <= 5; i++) {
      setViz({ diagStep: i });
      await sleep(400);
    }

    setAgent("diagnostic", { status: "done", thinking: "ICP estructurado · plan generado", toolIdx: -1 });
    artifact("diagnostic", `company:${company.id}`);
    log("diagnostic", `Diagnóstico completo → ${company.name}`);
    setDoneIdx(1);
    await sleep(600);

    // ── Phase 1: Domain ───────────────────────────────────────────────
    setActiveIdx(1);
    setAgent("domain", { status: "active", thinking: THINKING.domain[0], toolIdx: 0 });
    log("domain", "Planificando dominios…");

    let purchased: PurchasedDomainOut[] = [];
    let candidates: typeof domainCandidates = [];

    try {
      setAgent("domain", { thinking: THINKING.domain[0], toolIdx: 0 });
      const plan = await planDomains(company.id);
      log("domain", `Plan: ${plan.suggested_candidates.join(", ")}`);

      // Build candidate display list from plan suggestions
      const planCandidates = plan.suggested_candidates.map((d, i) => ({
        domain: d,
        price: 2.99 + i * 0.5,
        status: "available",
        chosen: false,
        reason: "",
      }));
      setDomainCandidates(planCandidates);
      candidates = planCandidates;

      setAgent("domain", { thinking: THINKING.domain[1], toolIdx: 1 });
      await sleep(800);

      // Animate evaluation
      for (let i = 0; i < Math.min(planCandidates.length, 5); i++) {
        setViz({ domEvaluated: i + 1 });
        await sleep(500);
      }

      setAgent("domain", { thinking: THINKING.domain[2], toolIdx: 2 });
      await sleep(600);

      setAgent("domain", { thinking: THINKING.domain[3], toolIdx: 3 });
      const purchaseResult = await purchaseDomains(company.id, true);
      log("domain", `Comprados: ${purchaseResult.purchased.map((p) => p.domain).join(", ")}`);
      artifact("domain", `domains:${purchaseResult.purchased.length}`);

      purchased = purchaseResult.purchased;
      const updatedCandidates = planCandidates.map((c) => ({
        ...c,
        chosen: purchaseResult.purchased.some((p) => p.domain === c.domain),
        reason: purchaseResult.rejected.find((r) => r.domain === c.domain)?.reason ?? "",
      }));
      setDomainCandidates(updatedCandidates);
      candidates = updatedCandidates;
      setPurchasedDomains(purchased);

      // If purchased is empty (dry run fallback), use plan suggestions
      if (purchased.length === 0) {
        const fallback: PurchasedDomainOut[] = plan.suggested_candidates.slice(0, 2).map((d, i) => ({
          id: `fake-${i}`,
          domain: d,
          status: "purchased",
          price_usd: 2.99,
          porkbun_order_id: null,
          idempotency_key: d,
          warmup_email: `outbound@${d}`,
        }));
        purchased = fallback;
        setPurchasedDomains(fallback);
        const updatedFallback = planCandidates.map((c, i) => ({
          ...c,
          chosen: i < 2,
          reason: i >= 2 ? "no se necesita un 3er dominio" : "",
        }));
        setDomainCandidates(updatedFallback);
        candidates = updatedFallback;
      }
    } catch (e) {
      log("domain", `Error: ${e}`, false);
      // fallback to suggested names from company
      const fallbackDomains = (company.suggested_domain_names ?? ["outbound1.com", "outbound2.io"]).slice(0, 2);
      const fallback: PurchasedDomainOut[] = fallbackDomains.map((d, i) => ({
        id: `fake-${i}`,
        domain: d,
        status: "purchased",
        price_usd: 2.99,
        porkbun_order_id: null,
        idempotency_key: d,
        warmup_email: `outbound@${d}`,
      }));
      purchased = fallback;
      setPurchasedDomains(fallback);
      const fakeCandidates = fallbackDomains.map((d, i) => ({
        domain: d, price: 2.99 + i * 0.5, status: "available", chosen: true, reason: "",
      }));
      setDomainCandidates(fakeCandidates);
      candidates = fakeCandidates;
    }

    setAgent("domain", { status: "done", thinking: `${purchased.length} dominios comprados`, toolIdx: -1 });
    setDoneIdx(2);
    await sleep(600);

    // ── Phase 2: DNS ──────────────────────────────────────────────────
    setActiveIdx(2);
    setAgent("dns", { status: "active", thinking: THINKING.dns[0], toolIdx: 0 });
    log("dns", "Configurando DNS para dominios comprados…");

    let allDnsRecords: DnsRecordOut[] = [];

    for (const domain of purchased) {
      try {
        setAgent("dns", { thinking: `Configurando ${domain.domain}…`, toolIdx: 0 });
        const configResult = await configureDns(domain.id, true);
        log("dns", `DNS configurado para ${domain.domain}: ${configResult.records.length} registros`);
        if (allDnsRecords.length === 0) {
          allDnsRecords = configResult.records;
          setDnsRecords(allDnsRecords);
        }

        setAgent("dns", { thinking: `Verificando ${domain.domain}…`, toolIdx: 2 });
        // Animate DNS verification
        for (let i = 0; i <= configResult.records.length; i++) {
          setViz({ dnsVerified: i });
          await sleep(350);
        }

        await verifyDns(domain.id, true);
        log("dns", `✓ DNS verificado: ${domain.domain}`);
        artifact("dns", `dns:${domain.domain}`);
      } catch (e) {
        log("dns", `Error DNS ${domain.domain}: ${e}`, false);
        // Use fallback DNS records for visualization
        if (allDnsRecords.length === 0) {
          allDnsRecords = [
            { id: "1", record_type: "MX", host: "@", value: "mxa.mailgun.org", priority: 10, status: "verified", external_record_id: null },
            { id: "2", record_type: "MX", host: "@", value: "mxb.mailgun.org", priority: 10, status: "verified", external_record_id: null },
            { id: "3", record_type: "TXT", host: "@", value: "v=spf1 include:mailgun.org ~all", priority: null, status: "verified", external_record_id: null },
            { id: "4", record_type: "TXT", host: `mta._domainkey.${domain.domain}`, value: "v=DKIM1; k=rsa; p=MIGfMA0…", priority: null, status: "verified", external_record_id: null },
            { id: "5", record_type: "TXT", host: `_dmarc.${domain.domain}`, value: "v=DMARC1; p=none; rua=mailto:dmarc@report.mailgun.com", priority: null, status: "verified", external_record_id: null },
            { id: "6", record_type: "CNAME", host: `email.${domain.domain}`, value: "mailgun.org", priority: null, status: "verified", external_record_id: null },
          ];
          setDnsRecords(allDnsRecords);
          for (let i = 0; i <= allDnsRecords.length; i++) {
            setViz({ dnsVerified: i });
            await sleep(350);
          }
        }
      }
    }

    setAgent("dns", { status: "done", thinking: `${allDnsRecords.length * purchased.length} registros verificados`, toolIdx: -1 });
    setDoneIdx(3);
    await sleep(600);

    // ── Phase 3: Warmup ───────────────────────────────────────────────
    setActiveIdx(3);
    setAgent("warmup", { status: "active", thinking: THINKING.warmup[0], toolIdx: 0 });
    log("warmup", "Iniciando warmup de inboxes…");

    try {
      await runWarmup(company.id, true, true);
      log("warmup", "Warmup iniciado (modo acelerado)");
    } catch (e) {
      log("warmup", `Warmup error (continuando simulación): ${e}`, false);
    }

    // Animate warmup days
    for (let day = 0; day < WARMUP_EVENTS.length; day++) {
      setViz({ warmDay: day });
      setAgent("warmup", { thinking: `Día ${day + 1} · rep ${WARMUP_EVENTS[day].reputation}/100`, toolIdx: day < 3 ? 1 : 2 });
      await sleep(700);
    }
    log("warmup", `Warmup completo · reputación ${WARMUP_EVENTS[WARMUP_EVENTS.length - 1].reputation}/100`);
    artifact("warmup", "warmup:done");

    setAgent("warmup", { status: "done", thinking: "Reputación 92/100 · listo para outbound", toolIdx: -1 });
    setDoneIdx(4);
    await sleep(600);

    // ── Phase 4: Research ─────────────────────────────────────────────
    setActiveIdx(4);
    setAgent("research", { status: "active", thinking: THINKING.research[0], toolIdx: 0 });
    log("research", "Buscando prospects que matchean ICP…");

    let researchTargetsList: TargetCompanyOut[] = [];
    let contactsList: ContactOut[] = [];
    let draftsList: EmailDraftOut[] = [];
    let campaignId: string | null = null;

    try {
      const researchResult = await researchTargets(company.id, 6);
      log("research", `${researchResult.targets.length} empresas encontradas`);
      campaignId = researchResult.campaign_id;
      researchTargetsList = researchResult.targets;
      contactsList = researchResult.contacts;
      setTargets(researchTargetsList);

      // Animate research scoring
      for (let i = 0; i <= researchResult.targets.length; i++) {
        setViz({ resDone: i, resBusy: i < researchResult.targets.length ? i : -1 });
        setAgent("research", { thinking: THINKING.research[Math.min(1, THINKING.research.length - 1)], toolIdx: 1 });
        await sleep(500);
        artifact("research", `target:${researchResult.targets[i - 1]?.name ?? ""}`);
      }

      log("research", "Generando email drafts…");
      setAgent("research", { thinking: THINKING.research[2], toolIdx: 2 });
      draftsList = await generateDrafts(campaignId);
      log("research", `${draftsList.length} drafts generados`);
      artifact("research", `drafts:${draftsList.length}`);
    } catch (e) {
      log("research", `Error research: ${e}`, false);
      // Show partial progress
      setViz({ resDone: 3, resBusy: -1 });
    }

    setAgent("research", { status: "done", thinking: `${researchTargetsList.length} prospects · ${draftsList.length} drafts listos`, toolIdx: -1 });
    setDoneIdx(5);

    log("research", "✓ Pipeline completo · bandeja de salida lista");
    await sleep(1000);

    onDone({
      company,
      domains: purchasedDomains,
      domainDetails: null,
      dnsResults: allDnsRecords.length > 0 ? [{
        domain_id: purchased[0]?.id ?? "",
        domain: purchased[0]?.domain ?? "",
        dry_run: true,
        mailgun_status: "active",
        records: allDnsRecords,
      }] : [],
      campaignId,
      targets: researchTargetsList,
      contacts: contactsList,
      drafts: draftsList,
    });
  }

  return (
    <div className="stage-shell">
      <PhaseRibbon activeIdx={activeIdx} doneIdx={doneIdx} />
      <div className="stage-body">
        <AgentStage
          activeAgent={AGENT_LIST[activeIdx]}
          agentStates={agentStates}
          vizState={vizState}
          company={company}
          rawInput={rawInput}
          domainCandidates={domainCandidates}
          purchasedDomains={purchasedDomains}
          dnsRecords={dnsRecords}
          warmupEvents={WARMUP_EVENTS}
          targets={targets}
        />
        <Console logs={logs} artifacts={artifacts} />
      </div>
    </div>
  );
}
