import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Google Analytics consent", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    document.getElementById("table-one-google-analytics")?.remove();
    delete window.dataLayer;
    delete window.gtag;
  });

  it("does not load Google Analytics before the player grants consent", async () => {
    const analytics = await import("../src/analytics");

    expect(analytics.initializeAnalytics()).toBe(false);
    expect(document.getElementById("table-one-google-analytics")).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it("loads the configured property and queues events after consent", async () => {
    const analytics = await import("../src/analytics");

    analytics.setAnalyticsConsent(true);
    analytics.trackAnalyticsEvent("game_started", { game_mode: "solo" });

    const script = document.getElementById(
      "table-one-google-analytics",
    ) as HTMLScriptElement | null;
    expect(script?.src).toContain("G-R0N2WZD69E");
    expect(window.dataLayer).toEqual(
      expect.arrayContaining([
        ["event", "game_started", { game_mode: "solo" }],
      ]),
    );
  });

  it("stops queuing events when analytics is disabled", async () => {
    const analytics = await import("../src/analytics");
    analytics.setAnalyticsConsent(true);
    const eventsBeforeDisable = window.dataLayer?.length ?? 0;

    analytics.setAnalyticsConsent(false);
    const eventsAfterDisable = window.dataLayer?.length ?? 0;
    analytics.trackAnalyticsEvent("game_heartbeat", { active_seconds: 60 });

    expect(eventsAfterDisable).toBe(eventsBeforeDisable + 1);
    expect(window.dataLayer).toHaveLength(eventsAfterDisable);
  });
});
