import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import type { AdminUserQuery, AdminUserRecord, AdminUserRepository } from "./users-route.ts";

export function createPrismaAdminUserRepository(prisma: PrismaClient): AdminUserRepository {
  return {
    async findUsers(query: AdminUserQuery): Promise<AdminUserRecord[]> {
      const cursorWhere: Prisma.UserWhereInput | undefined = query.cursor && {
        OR: [
          { createdAt: { lt: query.cursor.createdAt } },
          { createdAt: query.cursor.createdAt, id: { lt: query.cursor.id } },
        ],
      };
      return prisma.user.findMany({
        where: {
          ...(query.filter === "blocked" ? { isBlocked: true } : query.filter === "active" ? { isBlocked: false } : {}),
          ...(query.search ? { OR: [
            { displayName: { contains: query.search, mode: "insensitive" } },
            { telegramUsername: { contains: query.search, mode: "insensitive" } },
          ] } : {}),
          ...(cursorWhere ? { AND: [cursorWhere] } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: { id: true, displayName: true, telegramUsername: true, isBlocked: true, createdAt: true },
      });
    },

    async blockUser(userId: string): Promise<boolean> {
      return prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) return false;
        await tx.user.update({ where: { id: userId }, data: { isBlocked: true } });
        await tx.listing.deleteMany({ where: { sellerId: userId } });
        return true;
      });
    },

    async unblockUser(userId: string): Promise<boolean> {
      try {
        await prisma.user.update({ where: { id: userId }, data: { isBlocked: false } });
        return true;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") return false;
        throw error;
      }
    },
  };
}
