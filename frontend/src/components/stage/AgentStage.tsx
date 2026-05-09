"use client";
import type { CompanyOut, PurchasedDomainOut, DnsRecordOut, TargetCompanyOut } from "@/lib/types";
import { AGENT_ICONS, AGENT_LABELS, AGENT_ROLES, AGENT_LIST, type AgentName } from "./AgentIcons";
import DiagnosticVis from "./DiagnosticVis";
import DomainVis from "./DomainVis";
import DNSVis from "./DNSVis";
import WarmupVis from "./WarmupVis";
import ResearchVis from "./ResearchVis";

const TOOLS_BY_AGENT: Record<AgentName, string[]> = {
  diagnostic: ["parse_input", "extract_icp", "estimate_targets"],
  domain: ["check_availability", "filter_by_cap", "purchase"],
  dns: ["set_mx", "set_spf_dkim", "verify_dmarc"],
  warmup: ["pair_send", "open_reply", "score_reputation"],
  research: ["search_company", "rank_fit", "draft_email"],
};

export type AgentStatus = "idle" | "active" | "done";

export interface AgentState {
  status: AgentStatus;
  thinking: string;
  toolIdx: number;
}

interface DomainCandidate {
  domain: string;
  price: number;
  status: string;
  chosen: boolean;
  reason?: string;
}

interface WarmupEvent {
  day: number;
  sent: number;
  replied: number;
  opened: number;
  reputation: number;
}

export interface VizState {
  diagStep: number;
  domEvaluated: number;
  dnsVerified: number;
  warmDay: number;
  resDone: number;
  resBusy: number;
}

interface AgentStageProps {
  activeAgent: AgentName;
  agentStates: Record<AgentName, AgentState>;
  vizState: VizState;
  company: CompanyOut;
  rawInput: string;
  domainCandidates: DomainCandidate[];
  purchasedDomains: PurchasedDomainOut[];
  dnsRecords: DnsRecordOut[];
  warmupEvents: WarmupEvent[];
  targets: TargetCompanyOut[];
}

export default function AgentStage({
  activeAgent,
  agentStates,
  vizState,
  company,
  rawInput,
  domainCandidates,
  purchasedDomains,
  dnsRecords,
  warmupEvents,
  targets,
}: AgentStageProps) {
  const others = AGENT_LIST.filter((a) => a !== activeAgent);
  const domainsChosen = purchasedDomains.map((d) => d.domain);

  return (
    <div className="stage-grid">
      <HeroAgent
        agent={activeAgent}
        state={agentStates[activeAgent]}
        vizState={vizState}
        company={company}
        rawInput={rawInput}
        domainCandidates={domainCandidates}
        domainsChosen={domainsChosen}
        dnsRecords={dnsRecords}
        warmupEvents={warmupEvents}
        targets={targets}
      />
      <div className="thumbs">
        {others.map((agent) => (
          <ThumbAgent key={agent} agent={agent} state={agentStates[agent]} />
        ))}
      </div>
    </div>
  );
}

function HeroAgent({
  agent, state, vizState, company, rawInput, domainCandidates, domainsChosen, dnsRecords, warmupEvents, targets,
}: {
  agent: AgentName;
  state: AgentState;
  vizState: VizState;
  company: CompanyOut;
  rawInput: string;
  domainCandidates: DomainCandidate[];
  domainsChosen: string[];
  dnsRecords: DnsRecordOut[];
  warmupEvents: WarmupEvent[];
  targets: TargetCompanyOut[];
}) {
  const Icon = AGENT_ICONS[agent];
  const tools = TOOLS_BY_AGENT[agent];

  const vizNode = (() => {
    if (agent === "diagnostic") return <DiagnosticVis company={company} step={vizState.diagStep} rawInput={rawInput} />;
    if (agent === "domain") return <DomainVis candidates={domainCandidates} evaluatedCount={vizState.domEvaluated} />;
    if (agent === "dns") return <DNSVis records={dnsRecords} verifiedCount={vizState.dnsVerified} domains={domainsChosen} />;
    if (agent === "warmup") return <WarmupVis events={warmupEvents} dayIdx={vizState.warmDay} domains={domainsChosen} />;
    return <ResearchVis companies={targets} doneCount={vizState.resDone} busyIdx={vizState.resBusy} />;
  })();

  return (
    <div className={`hero-card agent-${agent} fade-up`} key={agent}>
      <div className="strip-top" />
      <div className="hero-head">
        <div className="hero-title">
          <span className="ico"><Icon /></span>
          <div className="meta-stack">
            <span className="ag-name">{AGENT_LABELS[agent]}</span>
            <span className="ag-role">{AGENT_ROLES[agent]}</span>
          </div>
        </div>
        <span className="hero-status">
          <span className="ring" />
          {state.status === "active" ? "trabajando" : state.status === "done" ? "completado" : "esperando"}
        </span>
      </div>

      <div className="hero-thinking">
        <span className="label">razonamiento</span>
        <span className="tok-faded">{state.thinking}</span>
        <span className="caret" />
      </div>

      <div className="hero-tools">
        {tools.map((t, i) => (
          <span key={t} className={`tool-chip ${i === state.toolIdx ? "is-active" : ""}`}>
            <span className="arrow">▶</span>
            {t}
          </span>
        ))}
      </div>

      <div className="hero-vis">{vizNode}</div>
    </div>
  );
}

function ThumbAgent({ agent, state }: { agent: AgentName; state: AgentState }) {
  const Icon = AGENT_ICONS[agent];
  const stLabel = state.status === "done" ? "listo" : state.status === "active" ? "en curso" : "en espera";

  return (
    <div className={`thumb agent-${agent} ${state.status === "done" ? "is-done" : ""}`}>
      <div className="thumb-head">
        <span className="ico"><Icon /></span>
        <span className="name">{AGENT_LABELS[agent]}</span>
        <span className="st">{stLabel}</span>
      </div>
      <div className="thumb-mini">
        {state.status === "done" ? <ThumbDone agent={agent} /> : <ThumbIdle agent={agent} />}
      </div>
    </div>
  );
}

function ThumbDone({ agent }: { agent: AgentName }) {
  const map: Record<AgentName, string> = {
    diagnostic: "ICP + plan extraídos",
    domain: "2 dominios comprados · < cap $4",
    dns: "SPF · DKIM · DMARC verificados",
    warmup: "reputación 92/100 · listo",
    research: "6 prospects scoreados · drafts listos",
  };
  const tone = agent;
  return <span className={`ts-done tone-${tone}`}>{map[agent]}</span>;
}

function ThumbIdle({ agent }: { agent: AgentName }) {
  const map: Record<AgentName, string> = {
    diagnostic: "esperando pitch",
    domain: "esperando ICP + nombre",
    dns: "esperando dominios",
    warmup: "esperando DNS verificado",
    research: "esperando warmup ≥ 80",
  };
  return <span>{map[agent]}</span>;
}
