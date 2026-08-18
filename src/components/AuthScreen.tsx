import { useState } from "react";
import type { useAuth } from "../hooks/useAuth";
import { isSupabaseConfigured } from "../auth/supabaseClient";

type AuthMode = "sign-in" | "sign-up" | "magic-link";

type AuthScreenProps = {
  auth: ReturnType<typeof useAuth>;
  initialMode?: AuthMode;
  onClose?: () => void;
};

export function AuthScreen({
  auth,
  initialMode = "sign-in",
  onClose,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    auth.clearError();
    if (mode === "sign-up" && password !== passwordConfirmation) {
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "sign-up") {
        const result = await auth.signUpWithPassword(
          email,
          password,
          displayName,
        );
        if (result === "confirmation-required") {
          setNotice("Account created. Check your email to confirm it.");
          setMode("sign-in");
        }
      } else if (mode === "sign-in") {
        const ok = await auth.signInWithPassword(email, password);
        if (ok && onClose) {
          onClose();
        }
      } else {
        const ok = await auth.signInWithMagicLink(email);
        if (ok) {
          setNotice("Check your email for a sign-in link.");
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={onClose ? "modal-backdrop" : "app-shell"}>
      <section
        className={
          onClose ? "settings-modal auth-modal" : "game-layout lobby-layout"
        }
      >
        <header className="auth-header">
          <div>
            <p className="eyebrow">Table One Mahjong</p>
            <h2>{mode === "sign-up" ? "Create account" : "Sign in"}</h2>
          </div>
          {onClose ? (
            <button
              className="icon-button"
              type="button"
              aria-label="Close account dialog"
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </header>
        <div className="panel-block settings-section join-panel">
          {!isSupabaseConfigured ? (
            <p className="next-hand-status" role="alert">
              Supabase isn't configured yet. Copy .env.example to .env, fill in
              your project URL/anon key, and restart the dev server.
            </p>
          ) : null}
          <div className="play-mode-control" aria-label="Auth mode">
            <button
              className={mode === "sign-in" ? "active" : ""}
              type="button"
              onClick={() => setMode("sign-in")}
            >
              Sign in
            </button>
            <button
              className={mode === "sign-up" ? "active" : ""}
              type="button"
              onClick={() => setMode("sign-up")}
            >
              Create account
            </button>
            <button
              className={mode === "magic-link" ? "active" : ""}
              type="button"
              onClick={() => setMode("magic-link")}
            >
              Magic link
            </button>
          </div>
          <form className="join-fields" onSubmit={handleSubmit}>
            {mode === "sign-up" ? (
              <label>
                <span>Display name</span>
                <input
                  autoComplete="nickname"
                  maxLength={18}
                  placeholder="Enter your name"
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </label>
            ) : null}
            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            {mode !== "magic-link" ? (
              <>
                <label>
                  <span>Password</span>
                  <input
                    autoComplete={
                      mode === "sign-up" ? "new-password" : "current-password"
                    }
                    minLength={6}
                    placeholder="At least 6 characters"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </label>
                {mode === "sign-up" ? (
                  <label>
                    <span>Confirm password</span>
                    <input
                      autoComplete="new-password"
                      minLength={6}
                      placeholder="Enter password again"
                      type="password"
                      value={passwordConfirmation}
                      onChange={(event) =>
                        setPasswordConfirmation(event.target.value)
                      }
                      required
                    />
                  </label>
                ) : null}
              </>
            ) : null}
            <button
              className="full-width-button"
              disabled={submitting}
              type="submit"
            >
              {mode === "sign-up"
                ? "Create account"
                : mode === "magic-link"
                  ? "Send magic link"
                  : "Sign in"}
            </button>
            {mode === "sign-up" &&
            passwordConfirmation &&
            password !== passwordConfirmation ? (
              <p className="next-hand-status" role="alert">
                Passwords do not match.
              </p>
            ) : null}
            {notice ? <p className="next-hand-status">{notice}</p> : null}
            {auth.error ? (
              <p className="next-hand-status" role="alert">
                {auth.error}
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </main>
  );
}
