import { useState } from "react";
import type { CompanyOut, DashboardData, CampaignResearchResult } from "@/lib/types";
import type { ConfirmPayload } from "@/lib/api";
import { getStreamToken, streamDiagnostic, confirmCompany, researchTargets } from "@/lib/api";
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
  const [landingError, setLandingError] = useState("");
  const [onboardingError, setOnboardingError] = useState("");
  const [company, setCompany] = useState<CompanyOut | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [preloadedResearch, setPreloadedResearch] = useState<CampaignResearchResult | null>(null);

  async function handleLandingSubmit(prompt: string, files: File[]) {
    setIsLoading(true);
    setLoadingStep("Obteniendo token de stream…");
    setLandingError("");
    setOnboardingError("");
    setRawInput(prompt);
    setCompany(null);
    setDashboardData(null);

    let tokenResp: { stream_url: string };
    try {
      tokenResp = await getStreamToken(prompt, files);
    } catch (e) {
      console.error("Stream token error:", e);
      setLandingError(
        getErrorMessage(
          e,
          "No pudimos iniciar el análisis. Probá de nuevo en unos minutos.",
        ),
      );
      setIsLoading(false);
      setLoadingStep("");
      return;
    }

    try {
      setLoadingStep("Analizando tu pitch con IA…");
      const analyzedCompany = await new Promise<CompanyOut>((resolve, reject) => {
        let isSettled = false;
        let es: EventSource | null = null;

        const finish = (callback: () => void) => {
          if (isSettled) return;
          isSettled = true;
          window.clearTimeout(timeoutId);
          es?.close();
          callback();
        };

        const timeoutId = window.setTimeout(() => {
          finish(() => reject(new Error("timeout")));
        }, 125_000);

        es = streamDiagnostic(tokenResp.stream_url, {
          onStart: (d) => setLoadingStep(d.message ?? "Iniciando análisis…"),
          onStep: (d) => setLoadingStep(d.message ?? d.label),
          onDone: (d) => finish(() => resolve(d.company)),
          onError: (d) => finish(() => reject(new Error(d.message))),
        });
      });

      setCompany(analyzedCompany);
      setScreen("onboarding");
    } catch (e) {
      console.error("Diagnostic error:", e);
      setLandingError(getDiagnosticErrorMessage(e));
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  }

  async function handleConfirm(payload: ConfirmPayload) {
    if (!company) return;
    setIsLoading(true);
    setOnboardingError("");
    try {
      setLoadingStep("Confirmando startup…");
      const confirmed = await confirmCompany(company.id, payload);
      setCompany(confirmed);

      setLoadingStep("Buscando prospects con IA… (puede tardar ~30 s)");
      const research = await researchTargets(confirmed.id, 6);
      setPreloadedResearch(research);

      setScreen("stage");
    } catch (e) {
      console.error("Confirm error:", e);
      setOnboardingError(
        getErrorMessage(
          e,
          "No pudimos confirmar la startup o buscar prospects. Revisá los datos e intentá de nuevo.",
        ),
      );
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  }

  function handleStageDone(data: DashboardData) {
    setDashboardData(data);
    setScreen("dashboard");
  }

  function handleReset() {
    setScreen("landing");
    setIsLoading(false);
    setLoadingStep("");
    setCompany(null);
    setDashboardData(null);
    setRawInput("");
    setLandingError("");
    setOnboardingError("");
    setPreloadedResearch(null);
  }

  function handleLandingInputChange() {
    if (!landingError) return;
    setLandingError("");
  }

  function handleOnboardingEdit() {
    if (!onboardingError) return;
    setOnboardingError("");
  }

  function handleOnboardingBack() {
    setScreen("landing");
    setCompany(null);
    setLoadingStep("");
    setLandingError("");
    setOnboardingError("");
  }

  return (
    <div className="app">
      <Topbar screen={screen} companyName={company?.name} onLogoClick={handleReset} />
      {screen === "landing" && (
        <LandingScreen
          onSubmit={handleLandingSubmit}
          onInputChange={handleLandingInputChange}
          isLoading={isLoading}
          loadingStep={loadingStep}
          submitError={landingError}
        />
      )}
      {screen === "onboarding" && company && (
        <OnboardingScreen
          company={company}
          onConfirm={handleConfirm}
          onBack={handleOnboardingBack}
          onEdit={handleOnboardingEdit}
          isLoading={isLoading}
          confirmError={onboardingError}
        />
      )}
      {screen === "stage" && company && (
        <StageScreen
          company={company}
          rawInput={rawInput}
          onDone={handleStageDone}
          preloadedResearch={preloadedResearch}
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

function getDiagnosticErrorMessage(error: unknown): string {
  const message = getErrorMessage(
    error,
    "No pudimos analizar tu pitch. Probá de nuevo en unos minutos.",
  );

  if (message === "timeout" || message === "agent timeout") {
    return "El análisis tardó demasiado. Probá de nuevo en unos minutos.";
  }

  if (message === "stream error") {
    return "Se cortó la conexión con el backend durante el análisis. Probá de nuevo.";
  }

  return message;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;

  const detailMatch = error.message.match(/:\s*(\{.*\}|\[.*\]|".*")$/);
  if (!detailMatch) {
    return error.message;
  }

  try {
    const parsed = JSON.parse(detailMatch[1]) as {
      detail?: string | { msg?: string; message?: string }[] | { message?: string };
      message?: string;
    };

    if (typeof parsed.message === "string") return parsed.message;
    if (typeof parsed.detail === "string") return parsed.detail;
    if (
      parsed.detail &&
      !Array.isArray(parsed.detail) &&
      typeof parsed.detail.message === "string"
    ) {
      return parsed.detail.message;
    }
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) return parsed.detail[0].msg;
  } catch {
    return error.message;
  }

  return error.message;
}
