import { DiscordSDK } from "@discord/embedded-app-sdk";
import { useEffect, useState } from "react";

export type DiscordActivityContext = {
  clientId: string;
  guildId: string | null;
  channelId: string | null;
  instanceId: string | null;
  user: {
    id: string;
    displayName: string;
  };
  gameSessionTicket: string;
};

type DiscordActivityState =
  | { status: "disabled"; context: null; error: null }
  | { status: "loading"; context: null; error: null }
  | { status: "ready"; context: DiscordActivityContext; error: null }
  | { status: "error"; context: null; error: string };

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;
const isEmbeddedDiscordActivity =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("frame_id");

export function useDiscordActivity(): DiscordActivityState {
  const [state, setState] = useState<DiscordActivityState>(() =>
    clientId && isEmbeddedDiscordActivity
      ? { status: "loading", context: null, error: null }
      : { status: "disabled", context: null, error: null },
  );

  useEffect(() => {
    if (!clientId || !isEmbeddedDiscordActivity) return;
    let cancelled = false;

    void (async () => {
      try {
        const sdk = new DiscordSDK(clientId);
        await sdk.ready();
        const { code } = await sdk.commands.authorize({
          client_id: clientId,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify"],
        });
        const response = await fetch("/.proxy/api/discord/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!response.ok) throw new Error("Discord token exchange failed");
        const responsePayload = (await response.json()) as {
          access_token?: unknown;
          game_session_ticket?: unknown;
        };
        if (
          typeof responsePayload.access_token !== "string" ||
          typeof responsePayload.game_session_ticket !== "string"
        ) {
          throw new Error("Discord token exchange returned no access token");
        }
        const auth = await sdk.commands.authenticate({
          access_token: responsePayload.access_token,
        });
        if (cancelled) return;
        setState({
          status: "ready",
          context: {
            clientId,
            guildId: sdk.guildId ?? null,
            channelId: sdk.channelId ?? null,
            instanceId: sdk.instanceId ?? null,
            user: {
              id: auth.user.id,
              displayName: auth.user.global_name?.trim() || auth.user.username,
            },
            gameSessionTicket: responsePayload.game_session_ticket,
          },
          error: null,
        });
      } catch (error) {
        if (cancelled) return;
        console.error("[Discord Activity] Initialization failed", error);
        setState({
          status: "error",
          context: null,
          error:
            error instanceof Error
              ? error.message
              : "Unable to connect to the Discord Activity host.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
