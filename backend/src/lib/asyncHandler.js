/**
 * Express 4 doesn't forward rejected promises from async handlers to the error
 * middleware on its own (that's an Express 5 feature) — without this, a thrown
 * error in an async route would just hang the request.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
