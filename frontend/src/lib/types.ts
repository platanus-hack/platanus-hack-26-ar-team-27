export type SizeRange = "solo" | "2-10" | "11-50" | "51-200" | "201+" | "unknown";

export interface CompanyOut {
  id: string;
  name: string;
  business_context_summary: string | null;
  icp_description: string | null;
  internal_company_size_range: SizeRange | null;
  target_company_count: number;
  suggested_domain_names: string[] | null;
  confirmation_status: "pending_user_confirmation" | "confirmed" | "rejected";
  agent_run_id: string | null;
}

export interface DomainPlan {
  company_id: string;
  target_company_count: number;
  required_domains: number;
  capped_domains: number;
  suggested_candidates: string[];
}

export interface PurchasedDomainOut {
  id: string;
  domain: string;
  status: string;
  price_usd: number | null;
  porkbun_order_id: string | null;
  idempotency_key: string;
  warmup_email: string | null;
}

export interface DomainPurchaseResult {
  company_id: string;
  dry_run: boolean;
  purchased: PurchasedDomainOut[];
  rejected: Array<{ domain: string; reason: string }>;
  audit_decision: string;
}

export interface DnsRecordOut {
  id: string;
  record_type: string;
  host: string | null;
  value: string;
  priority: number | null;
  status: string;
  external_record_id: string | null;
}

export interface DnsConfigureResult {
  domain_id: string;
  domain: string;
  dry_run: boolean;
  mailgun_status: string;
  records: DnsRecordOut[];
}

export interface DnsVerifyResult {
  domain_id: string;
  domain: string;
  status: string;
  pending_records: string[];
}

export interface TargetCompanyOut {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size_range: string | null;
  location: string | null;
  score: number | null;
  score_rationale: string | null;
  selection_status: string;
}

export interface ContactOut {
  id: string;
  full_name: string | null;
  title: string | null;
  email: string | null;
  validation_status: string;
}

export interface CampaignResearchResult {
  campaign_id: string;
  targets: TargetCompanyOut[];
  contacts: ContactOut[];
}

export interface EmailDraftOut {
  id: string;
  contact_id: string;
  target_company_id: string;
  from_email: string | null;
  subject: string;
  body_text: string;
  status: string;
}

export interface CampaignOut {
  id: string;
}

export interface WarmupStatus {
  domain_id: string;
  status: string;
  reputation?: number;
}

export type AgentName = "diagnostic" | "domain" | "dns" | "warmup" | "research";

export interface LogEntry {
  agent: AgentName;
  text: string;
  ts: string;
  ok: boolean;
}

export interface ArtifactEntry {
  code: AgentName;
  ref: string;
  when: string;
}

export interface DashboardData {
  company: CompanyOut;
  domains: PurchasedDomainOut[];
  domainDetails: DomainPurchaseResult | null;
  dnsResults: DnsConfigureResult[];
  campaignId: string | null;
  targets: TargetCompanyOut[];
  contacts: ContactOut[];
  drafts: EmailDraftOut[];
}
