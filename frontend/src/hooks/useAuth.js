import { useState, useEffect, useCallback } from "react";
import {
  signup as apiSignup, login as apiLogin, fetchMe,
  getToken, setToken, clearToken, setUnauthorizedHandler,
} from "../lib/api.js";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  // Lets api.js force a logout on any 401 (expired/invalid token) without
  // every call site needing to handle it individually.
  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then((res) => setUser(res.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const signup = useCallback(async (email, password) => {
    setSubmitting(true);
    setAuthError(null);
    try {
      const res = await apiSignup({ email, password });
      setToken(res.token);
      setUser(res.user);
      return { success: true };
    } catch (err) {
      const message = err.validationErrors
        ? err.validationErrors.map((e) => e.msg).join(", ")
        : err.message || "Failed to sign up";
      setAuthError(message);
      return { success: false, error: message };
    } finally {
      setSubmitting(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    setSubmitting(true);
    setAuthError(null);
    try {
      const res = await apiLogin({ email, password });
      setToken(res.token);
      setUser(res.user);
      return { success: true };
    } catch (err) {
      const message = err.validationErrors
        ? err.validationErrors.map((e) => e.msg).join(", ")
        : err.message || "Failed to log in";
      setAuthError(message);
      return { success: false, error: message };
    } finally {
      setSubmitting(false);
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return { user, loading, signup, login, logout, submitting, authError, clearAuthError };
}
