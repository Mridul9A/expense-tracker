import { useState, useEffect, useCallback } from "react";
import { fetchCategories, createCategory as apiCreateCategory } from "../lib/api.js";

export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCategories();
      setCategories(result.data);
    } catch (err) {
      setError(err.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const addCategory = useCallback(async (formData) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const category = await apiCreateCategory(formData);
      await load();
      return { success: true, category };
    } catch (err) {
      const message = err.validationErrors
        ? err.validationErrors.map((e) => e.msg).join(", ")
        : err.message || "Failed to create category";
      setSubmitError(message);
      return { success: false, error: message };
    } finally {
      setSubmitting(false);
    }
  }, [load]);

  const clearSubmitError = useCallback(() => setSubmitError(null), []);

  return {
    categories,
    loading,
    error,
    addCategory,
    submitting,
    submitError,
    clearSubmitError,
    reload: load,
  };
}
