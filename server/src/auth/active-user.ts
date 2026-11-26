import type { RequestHandler } from "express";
import type { AuthUserRepository } from "./user-repository.ts";

/**
 * Middleware that runs after requireSession. Loads the authenticated user and
 * rejects the request if the account is blocked.
 *
 * Place this after requireSession and before protected route handlers in app.ts.
 */
export function requireActiveUser(userRepository?: AuthUserRepository): RequestHandler {
  return async (_req, res, next) => {
    if (!userRepository) {
      res.status(503).json({ error: { code: "AUTHENTICATION_UNAVAILABLE", message: "Authentication is not configured." } });
      return;
    }
    const user = await userRepository.getUserById(res.locals.authenticatedUserId as string);
    if (!user) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "A valid user session is required." } });
      return;
    }
    if (user.isBlocked) {
      res.status(403).json({ error: { code: "ACCOUNT_BLOCKED", message: "Your access has been suspended." } });
      return;
    }
    next();
  };
}
