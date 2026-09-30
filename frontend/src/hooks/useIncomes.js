import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchIncomes,
  createIncome as apiCreateIncome,
  updateIncome as apiUpdateIncome,
  deleteIncome as apiDeleteIncome,
} from "../lib/api.js";

const DEFAULT_FILTERS = { account_id: "" };

export function useIncomes() {
  const [incomes, setIncomes] = useState([]);
  const [meta, setMeta] = useState({ count: 0, total: "0.00" });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const latestFetchId = useRef(0);

  const load = useCallback(async (currentFilters) => {
    setLoading(true);
    setError(null);
    const fetchId = ++latestFetchId.current;

    try {
      const result = await fetchIncomes({
        account_id: currentFilters.account_id || undefined,
      });

      if (fetchId !== latestFetchId.current) return;
      setIncomes(result.data);
      setMeta(result.meta);
    } catch (err) {
      if (fetchId !== latestFetchId.current) return;
      setError(err.message || "Failed to load income");
    } finally {
      if (fetchId === latestFetchId.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load(filters);
  }, [filters, load]);

  const updateFilters = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const addIncome = useCallback(async (formData) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      await apiCreateIncome(formData);
      await load(filters);
      return { success: true };
    } catch (err) {
      const message = err.validationErrors
        ? err.validationErrors.map((e) => e.msg).join(", ")
        : err.message || "Failed to add income";
      setSubmitError(message);
      return { success: false, error: message };
    } finally {
      setSubmitting(false);
    }
  }, [filters, load]);

  const clearSubmitError = useCallback(() => setSubmitError(null), []);

  const updateIncome = useCallback(async (id, formData) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      await apiUpdateIncome(id, formData);
      await load(filters);
      return { success: true };
    } catch (err) {
      const message = err.validationErrors
        ? err.validationErrors.map((e) => e.msg).join(", ")
        : err.message || "Failed to update income";
      setSubmitError(message);
      return { success: false, error: message };
    } finally {
      setSubmitting(false);
    }
  }, [filters, load]);

  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const deleteIncome = useCallback(async (id) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await apiDeleteIncome(id);
      await load(filters);
      return { success: true };
    } catch (err) {
      const message = err.message || "Failed to delete income";
      setDeleteError(message);
      return { success: false, error: message };
    } finally {
      setDeletingId(null);
    }
  }, [filters, load]);

  return {
    incomes,
    meta,
    filters,
    loading,
    error,
    updateFilters,
    addIncome,
    updateIncome,
    deleteIncome,
    deletingId,
    deleteError,
    submitting,
    submitError,
    clearSubmitError,
    reload: () => load(filters),
  };
}
