import { useState } from "react";
import type { CompanyOut, DashboardData } from "@/lib/types";
import type { ConfirmPayload } from "@/lib/api";
import { getStreamToken, streamDiagnostic, confirmCompany } from "@/lib/api";
import Topbar from "@/components/Topbar";
import LandingScreen from "@/components/screens/LandingScreen";
import OnboardingScreen from "@/components/screens/OnboardingScreen";
import StageScreen from "@/components/screens/StageScreen";
import DashboardScreen from "@/components/screens/DashboardScreen";
import EmailPreviewScreen from "@/components/screens/EmailPreviewScreen";

type Screen = "landing" | "onboarding" | "stage" | "dashboard" | "emailPreview";

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  async function handleLandingSubmit(prompt: string) {
    setIsLoading(true);
    setLoadingStep("Obteniendo token de stream…");
    setRawInput(prompt);
    try {
      const tokenResp = await getStreamToken(prompt);
      setLoadingStep("Analizando tu pitch con IA…");
      await new Promise<void>((resolve, reject) => {
        const es = streamDiagnostic(tokenResp.stream_url, {
          onStart: (d) => setLoadingStep(d.message ?? "Iniciando análisis…"),
          onStep: (d) => setLoadingStep(d.message ?? d.label),
          onDone: (d) => {
            setCompany(d.company);
            resolve();
          },
          onError: (d) => reject(new Error(d.message)),
        });
        setTimeout(() => { es.close(); reject(new Error("timeout")); }, 60_000);
      });
      setScreen("onboarding");
    } catch (e) {
      console.error("Diagnostic error:", e);
      // Fallback: create a stub company so the demo still works
      setCompany({
        id: "demo-" + Date.now(),
        name: extractName(prompt),
        business_context_summary: prompt.slice(0, 200),
        icp_description: "Extraído del pitch — editable",
        internal_company_size_range: "2-10",
        target_company_count: 50,
        suggested_domain_names: generateDomainSuggestions(prompt),
        confirmation_status: "pending_user_confirmation",
        agent_run_id: null,
      });
      setScreen("onboarding");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  }

  async function handleConfirm(payload: ConfirmPayload) {
    if (!company) return;
    setIsLoading(true);
    try {
      const confirmed = await confirmCompany(company.id, payload);
      setCompany(confirmed);
    } catch (e) {
      console.error("Confirm error:", e);
      // Update local company state with user edits even if API fails
      setCompany((prev) => prev ? {
        ...prev,
        name: payload.company_name ?? prev.name,
        icp_description: payload.icp_description ?? prev.icp_description,
        target_company_count: payload.campaign_target_company_count ?? prev.target_company_count,
        internal_company_size_range: (payload.internal_company_size_range as CompanyOut["internal_company_size_range"]) ?? prev.internal_company_size_range,
        suggested_domain_names: payload.suggested_domain_names ?? prev.suggested_domain_names,
        confirmation_status: "confirmed",
      } : prev);
    } finally {
      setIsLoading(false);
      setScreen("stage");
    }
  }

  function handleStageDone(data: DashboardData) {
    setDashboardData(data);
    setScreen("dashboard");
  }

  function handleReset() {
    setScreen("landing");
    setCompany(null);
    setDashboardData(null);
    setRawInput("");
  }

  return (
    <div className="app">
      <Topbar screen={screen} companyName={company?.name} />
      {screen === "landing" && (
        <LandingScreen
          onSubmit={handleLandingSubmit}
          isLoading={isLoading}
          loadingStep={loadingStep}
        />
      )}
      {screen === "onboarding" && company && (
        <OnboardingScreen
          company={company}
          onConfirm={handleConfirm}
          onBack={() => setScreen("landing")}
          isLoading={isLoading}
        />
      )}
      {screen === "stage" && company && (
        <StageScreen
          company={company}
          rawInput={rawInput}
          onDone={handleStageDone}
        />
      )}
      {screen === "dashboard" && dashboardData && (
        <DashboardScreen
          data={dashboardData}
          onOpenInbox={() => setScreen("emailPreview")}
          onReset={handleReset}
        />
      )}
      {screen === "emailPreview" && dashboardData && (
        <EmailPreviewScreen
          data={dashboardData}
          onBack={() => setScreen("dashboard")}
        />
      )}
    </div>
  );
}

function extractName(prompt: string): string {
  const match = prompt.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)*)/);
  return match?.[1] ?? "Mi Startup";
}

function generateDomainSuggestions(prompt: string): string[] {
  const name = extractName(prompt).toLowerCase().replace(/\s+/g, "");
  return [`${name}.io`, `try${name}.com`, `${name}-hq.co`];
}
