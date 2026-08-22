export const ANALYTICS_MEASUREMENT_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || "G-R0N2WZD69E";

const ANALYTICS_CONSENT_KEY = "table-one-analytics-consent";
const ANALYTICS_SCRIPT_ID = "table-one-google-analytics";

export type AnalyticsConsent = "granted" | "denied" | null;
export type AnalyticsParameters = Record<
  string,
  string | number | boolean | undefined
>;

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

function consentUpdate(analyticsStorage: "granted" | "denied") {
  return {
    analytics_storage: analyticsStorage,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  } as const;
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
  return stored === "granted" || stored === "denied" ? stored : null;
}

export function initializeAnalytics() {
  if (
    typeof window === "undefined" ||
    initialized ||
    getAnalyticsConsent() !== "granted"
  ) {
    return false;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

  window.gtag("consent", "update", consentUpdate("granted"));

  if (!document.getElementById(ANALYTICS_SCRIPT_ID)) {
    window.gtag("js", new Date());
    window.gtag("config", ANALYTICS_MEASUREMENT_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    const script = document.createElement("script");
    script.id = ANALYTICS_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_MEASUREMENT_ID)}`;
    document.head.appendChild(script);
  }

  initialized = true;
  window.gtag("event", "analytics_ready", {
    consent_state: "granted",
    non_interaction: true,
  });
  return true;
}

export function setAnalyticsConsent(granted: boolean) {
  if (typeof window === "undefined") return;
  const previousConsent = getAnalyticsConsent();
  const consent = granted ? "granted" : "denied";
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);

  if (granted) {
    if (!initializeAnalytics()) {
      window.gtag?.("consent", "update", consentUpdate("granted"));
    }
    if (previousConsent !== "granted") {
      window.gtag?.("event", "page_view", {
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  } else {
    window.gtag?.("consent", "update", consentUpdate("denied"));
  }
}

export function trackAnalyticsEvent(
  eventName: string,
  parameters: AnalyticsParameters = {},
) {
  if (getAnalyticsConsent() !== "granted") return;
  initializeAnalytics();
  window.gtag?.("event", eventName, parameters);
}
