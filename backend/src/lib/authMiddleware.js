import { verifyToken } from "./jwt.js";
import { asyncHandler } from "./asyncHandler.js";
import { getUserById } from "../db/userModel.js";

export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await getUserById(payload.sub);
  if (!user) {
    return res.status(401).json({ error: "User no longer exists" });
  }

  req.userId = user.id;
  req.user = user;
  next();
});
