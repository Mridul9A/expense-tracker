import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
if (!process.env.JWT_SECRET) {
  console.warn("JWT_SECRET not set — using an insecure default. Set JWT_SECRET in production.");
}

const EXPIRES_IN = "30d";

export const signToken = (userId) => jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: EXPIRES_IN });
export const verifyToken = (token) => jwt.verify(token, JWT_SECRET);
