import { Router, type Response } from "express";
import type { AuthUserRepository } from "./user-repository.ts";

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function serializeProfile(user: NonNullable<Awaited<ReturnType<AuthUserRepository["getUserById"]>>>) {
  return {
    id: user.id,
    telegramUsername: user.telegramUsername,
    displayName: user.displayName,
    phoneNumber: user.phoneNumber,
    isAdmin: user.isAdmin,
  };
}

export function createProfileRouter(userRepository?: AuthUserRepository) {
  const router = Router();

  router.get("/me", async (_req, res) => {
    if (!userRepository) {
      sendError(res, 503, "PROFILE_UNAVAILABLE", "Profile service is not configured.");
      return;
    }
    const user = await userRepository.getUserById(res.locals.authenticatedUserId as string);
    if (!user) {
      sendError(res, 404, "NOT_FOUND", "The profile was not found.");
      return;
    }
    res.status(200).json(serializeProfile(user));
  });

  router.patch("/me", async (req, res) => {
    if (!userRepository) {
      sendError(res, 503, "PROFILE_UNAVAILABLE", "Profile service is not configured.");
      return;
    }

    const body: unknown = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      sendError(res, 400, "VALIDATION_ERROR", "Provide editable profile fields.");
      return;
    }
    const record = body as Record<string, unknown>;
    const keys = Object.keys(record);
    if (!keys.length || keys.some((key) => key !== "displayName" && key !== "phoneNumber")) {
      sendError(res, 400, "VALIDATION_ERROR", "Only displayName and phoneNumber can be updated.");
      return;
    }

    const update: { displayName?: string; phoneNumber?: string | null } = {};
    if ("displayName" in record) {
      if (typeof record.displayName !== "string" || !record.displayName.trim() || record.displayName.trim().length > 80) {
        sendError(res, 400, "VALIDATION_ERROR", "Display name must contain 1 to 80 characters.");
        return;
      }
      update.displayName = record.displayName.trim();
    }
    if ("phoneNumber" in record) {
      if (record.phoneNumber !== null && (typeof record.phoneNumber !== "string" || !record.phoneNumber.trim() || record.phoneNumber.trim().length > 32)) {
        sendError(res, 400, "VALIDATION_ERROR", "Phone number must contain 1 to 32 characters or be null.");
        return;
      }
      update.phoneNumber = typeof record.phoneNumber === "string" ? record.phoneNumber.trim() : null;
    }

    const user = await userRepository.updateProfile(res.locals.authenticatedUserId as string, update);
    if (!user) {
      sendError(res, 404, "NOT_FOUND", "The profile was not found.");
      return;
    }
    res.status(200).json(serializeProfile(user));
  });

  return router;
}
