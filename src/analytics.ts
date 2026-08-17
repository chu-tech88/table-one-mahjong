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

  window.gtag("consent", "update", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });

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
  return true;
}

export function setAnalyticsConsent(granted: boolean) {
  if (typeof window === "undefined") return;
  const consent = granted ? "granted" : "denied";
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);

  if (granted) {
    if (!initializeAnalytics()) {
      window.gtag?.("consent", "update", {
        analytics_storage: "granted",
      });
    }
  } else {
    window.gtag?.("consent", "update", {
      analytics_storage: "denied",
    });
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
