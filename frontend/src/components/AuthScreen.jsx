import { useState } from "react";

const EMPTY = { email: "", password: "" };

export function AuthScreen({ onLogin, onSignup, submitting, authError, onClearError }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [form, setForm] = useState(EMPTY);
  const [localError, setLocalError] = useState(null);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setLocalError(null);
    if (authError) onClearError();
  };

  const switchMode = (next) => {
    setMode(next);
    setForm(EMPTY);
    setLocalError(null);
    if (authError) onClearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) return setLocalError("Email is required");
    if (mode === "signup" && form.password.length < 8) {
      return setLocalError("Password must be at least 8 characters");
    }
    if (!form.password) return setLocalError("Password is required");

    const action = mode === "login" ? onLogin : onSignup;
    await action(form.email.trim(), form.password);
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="logo auth-logo">
          <span className="logo-mark">₹</span>
          <span className="logo-text">Ledger</span>
        </div>
        <p className="auth-tagline">
          {mode === "login" ? "Log in to your accounts." : "Create an account to get started."}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={form.email}
              onChange={set("email")}
              disabled={submitting}
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={form.password}
              onChange={set("password")}
              disabled={submitting}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            {mode === "signup" && (
              <span className="field-hint">At least 8 characters</span>
            )}
          </div>

          {(localError || authError) && (
            <div className="alert alert-error" role="alert">{localError || authError}</div>
          )}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? (
              <span className="btn-loading">
                <span className="spinner" aria-hidden="true" />
                {mode === "login" ? "Logging in…" : "Signing up…"}
              </span>
            ) : (
              mode === "login" ? "Log In" : "Sign Up"
            )}
          </button>
        </form>

        <p className="auth-switch">
          {mode === "login" ? (
            <>No account? <button type="button" onClick={() => switchMode("signup")}>Sign up</button></>
          ) : (
            <>Already have an account? <button type="button" onClick={() => switchMode("login")}>Log in</button></>
          )}
        </p>
      </div>
    </div>
  );
}
