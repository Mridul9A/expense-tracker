import { useAuth } from "./hooks/useAuth.js";
import { AuthScreen } from "./components/AuthScreen.jsx";
import { AuthenticatedApp } from "./AuthenticatedApp.jsx";

export default function App() {
  const { user, loading, login, signup, logout, submitting, authError, clearAuthError } = useAuth();

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="loading-state">
          <span className="spinner" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onLogin={login}
        onSignup={signup}
        submitting={submitting}
        authError={authError}
        onClearError={clearAuthError}
      />
    );
  }

  return <AuthenticatedApp user={user} onLogout={logout} />;
}
