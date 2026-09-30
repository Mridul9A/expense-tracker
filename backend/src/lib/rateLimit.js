import rateLimit from "express-rate-limit";

// The integration test suite signs up/logs in far more than a real user would
// in the same window, all from one IP — rate limiting is about real-world
// abuse patterns, not something tests should have to work around.
const skip = () => process.env.NODE_ENV === "test";

// Keyed per-IP by default. Generous enough to not annoy a real user who
// mistypes a password a few times, strict enough to make brute-forcing
// impractical.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "Too many login attempts. Try again in a few minutes." },
});

// Signup is cheaper to abuse (no credential to guess) but more damaging if
// automated — caps how many accounts one IP can create per hour.
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: "Too many accounts created from this address. Try again later." },
});
