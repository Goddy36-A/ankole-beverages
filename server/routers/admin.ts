import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { permissions, roles, rolePermissions, systemSettings, userRoles, users } from "../../drizzle/schema";
import { getDb, userHasPermission, writeAuditLog } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

async function requirePermission(ctx: { user: { openId: string; id: number } }, permission: string) {
  if (!(await userHasPermission(ctx.user.openId, permission))) throw new TRPCError({ code: "FORBIDDEN", message: `Permission required: ${permission}` });
}

export const adminRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { user: ctx.user, permissions: [] };
    const user = (await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1))[0] ?? ctx.user;
    const rows = await db.select({ code: permissions.code }).from(userRoles).innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId)).innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id)).where(eq(userRoles.userId, ctx.user.id));
    return { user, permissions: rows.map((row) => row.code) };
  }),
  users: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "users.manage");
    const db = await getDb();
    return db ? db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).orderBy(desc(users.createdAt)) : [];
  }),
  roles: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "users.manage");
    const db = await getDb();
    return db ? db.select().from(roles).orderBy(roles.name) : [];
  }),
  permissions: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "users.manage");
    const db = await getDb();
    return db ? db.select().from(permissions).orderBy(permissions.code) : [];
  }),
  assignRole: protectedProcedure.input(z.object({ userId: z.number().int().positive(), roleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "users.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const role = (await db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1))[0];
    if (!role || !role.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Role is not active" });
    await db.delete(userRoles).where(eq(userRoles.userId, input.userId));
    await db.insert(userRoles).values({ userId: input.userId, roleId: input.roleId });
    await db.update(users).set({ role: role.name === "Admin" ? "admin" : role.name }).where(eq(users.id, input.userId));
    await writeAuditLog({ userId: ctx.user.id, action: "ASSIGN_ROLE", entityType: "USER", entityId: input.userId, details: { roleId: input.roleId, roleName: role.name } });
    return { success: true };
  }),
  setUserActive: protectedProcedure.input(z.object({ userId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "users.manage");
    if (input.userId === ctx.user.id && !input.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate your own account" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    await db.update(users).set({ isActive: input.isActive }).where(eq(users.id, input.userId));
    await writeAuditLog({ userId: ctx.user.id, action: input.isActive ? "ACTIVATE" : "DEACTIVATE", entityType: "USER", entityId: input.userId });
    return { success: true };
  }),
  settings: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "settings.manage");
    const db = await getDb();
    return db ? db.select().from(systemSettings).orderBy(systemSettings.settingKey) : [];
  }),
  setSetting: protectedProcedure.input(z.object({ settingKey: z.string().min(2), settingValue: z.string(), description: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "settings.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    await db.insert(systemSettings).values({ ...input, updatedBy: ctx.user.id }).onDuplicateKeyUpdate({ set: { settingValue: input.settingValue, description: input.description, updatedBy: ctx.user.id } });
    await writeAuditLog({ userId: ctx.user.id, action: "UPDATE", entityType: "SYSTEM_SETTING", details: input });
    return { success: true };
  }),
});
