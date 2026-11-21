import type { RequestHandler } from "express";
import type { AuthUserRepository } from "./user-repository.ts";

export function requireAdmin(userRepository?: AuthUserRepository): RequestHandler {
  return async (_req, res, next) => {
    if (!userRepository) {
      res.status(503).json({ error: { code: "ADMIN_UNAVAILABLE", message: "Admin access is unavailable." } });
      return;
    }
    const user = await userRepository.getUserById(res.locals.authenticatedUserId as string);
    if (!user) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "A valid user session is required." } });
      return;
    }
    if (!user.isAdmin) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
      return;
    }
    next();
  };
}
