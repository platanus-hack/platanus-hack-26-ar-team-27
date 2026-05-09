import type {
  CompanyOut,
  DomainPlan,
  DomainPurchaseResult,
  PurchasedDomainOut,
  DnsConfigureResult,
  DnsVerifyResult,
  CampaignResearchResult,
  EmailDraftOut,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const API_KEY =
  process.env.NEXT_PUBLIC_BACKEND_API_KEY || "";

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) h["X-Api-Key"] = API_KEY;
  return h;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`POST ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`GET ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Diagnostic ────────────────────────────────────────────────────────
export interface StreamTokenResp {
  token: string;
  ttl_seconds: number;
  stream_url: string;
}

export async function getStreamToken(rawInput: string): Promise<StreamTokenResp> {
  return post<StreamTokenResp>("/companies/analyze/stream-token", {
    raw_input: rawInput,
    files: [],
  });
}

export function streamDiagnostic(
  streamUrl: string,
  handlers: {
    onStart?: (d: { message: string; use_anthropic: boolean }) => void;
    onStep?:  (d: { label: string; message: string }) => void;
    onDone?:  (d: { company: CompanyOut }) => void;
    onError?: (d: { message: string }) => void;
  }
): EventSource {
  const es = new EventSource(`${API_BASE}${streamUrl}`);
  es.addEventListener("start", (e) => {
    handlers.onStart?.(JSON.parse((e as MessageEvent).data));
  });
  es.addEventListener("step", (e) => {
    handlers.onStep?.(JSON.parse((e as MessageEvent).data));
  });
  es.addEventListener("done", (e) => {
    handlers.onDone?.(JSON.parse((e as MessageEvent).data));
    es.close();
  });
  es.addEventListener("error", (e) => {
    handlers.onError?.({ message: (e as MessageEvent).data ?? "stream error" });
    es.close();
  });
  return es;
}

// ── Company confirm ───────────────────────────────────────────────────
export interface ConfirmPayload {
  company_name?: string;
  icp_description?: string;
  campaign_target_company_count?: number;
  internal_company_size_range?: string;
  suggested_domain_names?: string[];
}

export async function confirmCompany(
  companyId: string,
  payload: ConfirmPayload
): Promise<CompanyOut> {
  return post<CompanyOut>(`/companies/${companyId}/confirm`, payload);
}

// ── Domains ───────────────────────────────────────────────────────────
export async function planDomains(companyId: string): Promise<DomainPlan> {
  return post<DomainPlan>(`/companies/${companyId}/domains/plan`);
}

export async function purchaseDomains(
  companyId: string,
  execute = false,
  candidates?: string[]
): Promise<DomainPurchaseResult> {
  return post<DomainPurchaseResult>(`/companies/${companyId}/domains/purchase`, {
    execute,
    ...(candidates ? { candidates } : {}),
  });
}

export async function listDomains(
  companyId: string
): Promise<PurchasedDomainOut[]> {
  return get<PurchasedDomainOut[]>(`/companies/${companyId}/domains`);
}

// ── DNS ───────────────────────────────────────────────────────────────
export async function configureDns(
  domainId: string,
  execute = false
): Promise<DnsConfigureResult> {
  return post<DnsConfigureResult>(`/domains/${domainId}/dns/configure`, {
    execute,
  });
}

export async function verifyDns(
  domainId: string,
  execute = false
): Promise<DnsVerifyResult> {
  return post<DnsVerifyResult>(`/domains/${domainId}/dns/verify`, { execute });
}

// ── Warmup ────────────────────────────────────────────────────────────
export async function runWarmup(
  companyId: string,
  execute = false,
  accelerated = true
): Promise<unknown> {
  return post(`/warmup/run?company_id=${companyId}`, { execute, accelerated });
}

// ── Campaigns ─────────────────────────────────────────────────────────
export async function researchTargets(
  companyId: string,
  limit = 6
): Promise<CampaignResearchResult> {
  return post<CampaignResearchResult>(`/campaigns/${companyId}/research`, {
    csv_path: null,
    limit,
  });
}

export async function generateDrafts(
  campaignId: string
): Promise<EmailDraftOut[]> {
  return post<EmailDraftOut[]>(`/campaigns/${campaignId}/drafts`);
}

export async function approveDrafts(
  campaignId: string,
  approveAll = true
): Promise<unknown> {
  return post(`/campaigns/${campaignId}/approve`, {
    draft_ids: [],
    approve_all: approveAll,
  });
}

export async function sendCampaign(
  campaignId: string,
  execute = false
): Promise<unknown> {
  return post(`/campaigns/${campaignId}/send`, { execute });
}
