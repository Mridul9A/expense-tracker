import { useState, useEffect, useCallback } from "react";
import { fetchAccounts, createAccount as apiCreateAccount } from "../lib/api.js";

export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAccounts();
      setAccounts(result.data);
    } catch (err) {
      setError(err.message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const addAccount = useCallback(async (formData) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiCreateAccount(formData);
      await load();
      return { success: true };
    } catch (err) {
      const message = err.validationErrors
        ? err.validationErrors.map((e) => e.msg).join(", ")
        : err.message || "Failed to create account";
      setSubmitError(message);
      return { success: false, error: message };
    } finally {
      setSubmitting(false);
    }
  }, [load]);

  const clearSubmitError = useCallback(() => setSubmitError(null), []);

  return {
    accounts,
    loading,
    error,
    addAccount,
    submitting,
    submitError,
    clearSubmitError,
    reload: load,
  };
}
