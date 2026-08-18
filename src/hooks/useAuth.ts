import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../auth/supabaseClient";

export type AuthStatus = "loading" | "signed-out" | "signed-in";

export type SignUpResult = "signed-in" | "confirmation-required";

export function displayNameOf(user: User | null | undefined) {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const raw = meta.display_name;
  return typeof raw === "string" ? raw.trim() : "";
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? "loading" : "signed-out",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setStatus(data.session ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("signed-out");
      });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setStatus(nextSession ? "signed-in" : "signed-out");
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signUpWithPassword = useCallback(
    async (email: string, password: string, displayName: string) => {
      setError(null);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.trim() || "Player" },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return false;
      }
      // Supabase returns no error but an empty identities array when the
      // email is already registered, to avoid leaking account existence.
      if (data.user && data.user.identities?.length === 0) {
        setError(
          "That email is already registered. Try signing in or use magic link instead.",
        );
        return false;
      }
      return data.session ? "signed-in" : "confirmation-required";
    },
    [],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return false;
      }
      return true;
    },
    [],
  );

  const signInWithMagicLink = useCallback(async (email: string) => {
    setError(null);
    const { error: magicLinkError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (magicLinkError) {
      setError(magicLinkError.message);
      return false;
    }
    return true;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    status,
    session,
    user: session?.user ?? null,
    error,
    clearError: () => setError(null),
    signUpWithPassword,
    signInWithPassword,
    signInWithMagicLink,
    signOut,
  };
}
