import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchExpenses,
  createExpense as apiCreateExpense,
  updateExpense as apiUpdateExpense,
  deleteExpense as apiDeleteExpense,
} from "../lib/api.js";

const DEFAULT_FILTERS = { account_id: "", category_id: "", sort: "date_desc" };

export function useExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [meta, setMeta] = useState({ count: 0, total: "0.00" });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track the latest fetch so stale responses from previous filter changes don't clobber fresh ones
  const latestFetchId = useRef(0);

  const load = useCallback(async (currentFilters) => {
    setLoading(true);
    setError(null);
    const fetchId = ++latestFetchId.current;

    try {
      const result = await fetchExpenses({
        account_id: currentFilters.account_id || undefined,
        category_id: currentFilters.category_id || undefined,
        sort: currentFilters.sort || undefined,
      });

      if (fetchId !== latestFetchId.current) return; // stale response, discard
      setExpenses(result.data);
      setMeta(result.meta);
    } catch (err) {
      if (fetchId !== latestFetchId.current) return;
      setError(err.message || "Failed to load expenses");
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

  const addExpense = useCallback(async (formData) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      await apiCreateExpense(formData);
      // Reload with current filters after successful creation
      await load(filters);
      return { success: true };
    } catch (err) {
      const message = err.validationErrors
        ? err.validationErrors.map((e) => e.msg).join(", ")
        : err.message || "Failed to create expense";
      setSubmitError(message);
      return { success: false, error: message };
    } finally {
      setSubmitting(false);
    }
  }, [filters, load]);

  const clearSubmitError = useCallback(() => setSubmitError(null), []);

  const updateExpense = useCallback(async (id, formData) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      await apiUpdateExpense(id, formData);
      await load(filters);
      return { success: true };
    } catch (err) {
      const message = err.validationErrors
        ? err.validationErrors.map((e) => e.msg).join(", ")
        : err.message || "Failed to update expense";
      setSubmitError(message);
      return { success: false, error: message };
    } finally {
      setSubmitting(false);
    }
  }, [filters, load]);

  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const deleteExpense = useCallback(async (id) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await apiDeleteExpense(id);
      await load(filters);
      return { success: true };
    } catch (err) {
      const message = err.message || "Failed to delete expense";
      setDeleteError(message);
      return { success: false, error: message };
    } finally {
      setDeletingId(null);
    }
  }, [filters, load]);

  return {
    expenses,
    meta,
    filters,
    loading,
    error,
    updateFilters,
    addExpense,
    updateExpense,
    deleteExpense,
    deletingId,
    deleteError,
    submitting,
    submitError,
    clearSubmitError,
    reload: () => load(filters),
  };
}
