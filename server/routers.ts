import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ensureSystemBootstrap, writeAuditLog } from "./db";
import { adminRouter } from "./routers/admin";
import { catalogRouter } from "./routers/catalog";
import { operationsRouter } from "./routers/operations";
import { reportingRouter } from "./routers/reporting";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (ctx.user) {
        await ensureSystemBootstrap(ctx.user.openId);
        await writeAuditLog({ userId: ctx.user.id, action: "AUTHENTICATED", entityType: "AUTH", details: { method: ctx.user.loginMethod ?? "session" } });
      }
      return ctx.user;
    }),
    logout: protectedProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      await writeAuditLog({ userId: ctx.user.id, action: "LOGOUT", entityType: "AUTH" });
      return { success: true } as const;
    }),
  }),
  admin: adminRouter,
  catalog: catalogRouter,
  operations: operationsRouter,
  reporting: reportingRouter,
});

export type AppRouter = typeof appRouter;
