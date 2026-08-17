import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  categories,
  customers,
  InsertUser,
  paymentMethods,
  permissions,
  roles,
  rolePermissions,
  suppliers,
  units,
  userRoles,
  users,
  packagings,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  } else {
    values.lastSignedIn = new Date();
    updateSet.lastSignedIn = values.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

const PERMISSIONS = [
  ["dashboard.view", "View operational dashboard"],
  ["catalog.view", "View products and catalog settings"],
  ["catalog.manage", "Manage products, categories, units, and packaging"],
  ["partners.manage", "Manage suppliers and customers"],
  ["purchases.view", "View purchases"],
  ["purchases.manage", "Create purchase orders"],
  ["purchases.receive", "Receive purchase stock"],
  ["sales.view", "View sales and invoices"],
  ["sales.create", "Create and complete sales"],
  ["sales.discount", "Apply sale discounts"],
  ["sales.credit.override", "Override customer credit limits"],
  ["payments.manage", "Record and view payments"],
  ["inventory.view", "View stock and movements"],
  ["inventory.adjust", "Request stock adjustments"],
  ["inventory.adjust.approve", "Approve stock adjustments"],
  ["inventory.count", "Record physical stock counts"],
  ["returns.manage", "Process traceable purchase and sales returns"],
  ["reports.view", "View business reports"],
  ["reports.export", "Export business reports"],
  ["users.manage", "Manage users and roles"],
  ["settings.manage", "Manage system settings"],
  ["audit.view", "View audit history"],
] as const;

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  Admin: ["*"],
  Manager: PERMISSIONS.map(([code]) => code).filter((code) => !["users.manage", "settings.manage"].includes(code)),
  "Sales Officer": [
    "dashboard.view", "partners.manage", "sales.view", "sales.create", "payments.manage", "reports.view",
  ],
  Storekeeper: [
    "dashboard.view", "catalog.view", "catalog.manage", "purchases.view", "purchases.manage", "purchases.receive",
    "inventory.view", "inventory.adjust", "inventory.count", "returns.manage", "reports.view",
  ],
};

export async function ensureSystemBootstrap(openId: string) {
  const db = await getDb();
  if (!db) return;

  for (const [code, description] of PERMISSIONS) {
    await db.insert(permissions).values({ code, description }).onDuplicateKeyUpdate({ set: { description } });
  }
  for (const name of ["Admin", "Manager", "Sales Officer", "Storekeeper"]) {
    await db.insert(roles).values({ name, description: `${name} operational role` }).onDuplicateKeyUpdate({ set: { description: `${name} operational role` } });
  }
  for (const name of ["Cash", "Mobile Money", "Bank"]) {
    await db.insert(paymentMethods).values({ name, description: "Configured system payment method" }).onDuplicateKeyUpdate({ set: { description: "Configured system payment method" } });
  }
  for (const [name, description] of [["Soft Drinks", "Carbonated beverage products"], ["Energy Drinks", "Energy beverage products"], ["Water", "Bottled water products"], ["Juice", "Juice beverage products"], ["Other", "Other configured products"]] as const) {
    await db.insert(categories).values({ name, description }).onDuplicateKeyUpdate({ set: { description } });
  }
  for (const [name, symbol] of [["Piece", "pc"], ["Crate", "crt"], ["Case", "case"]] as const) {
    await db.insert(units).values({ name, symbol }).onDuplicateKeyUpdate({ set: { symbol } });
  }
  for (const name of ["Bottle", "Can", "Crate", "Case", "Other"]) {
    await db.insert(packagings).values({ name, description: "Configurable product packaging" }).onDuplicateKeyUpdate({ set: { description: "Configurable product packaging" } });
  }

  const user = await getUserByOpenId(openId);
  if (!user) return;
  const desiredRole = user.role === "admin" || openId === ENV.ownerOpenId ? "Admin" : "Manager";
  const role = await db.select().from(roles).where(eq(roles.name, desiredRole)).limit(1);
  if (!role[0]) return;
  let bootstrapped = false;
  const existing = await db.select().from(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, role[0].id))).limit(1);
  if (!existing[0]) { await db.insert(userRoles).values({ userId: user.id, roleId: role[0].id }); bootstrapped = true; }

  const rolePermissionsRows = await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, role[0].id));
  if (rolePermissionsRows.length === 0) {
    const desiredPermissions = ROLE_PERMISSIONS[desiredRole] ?? [];
    const allPermissions = await db.select().from(permissions);
    const permissionRows = desiredPermissions.includes("*") ? allPermissions : allPermissions.filter((permission) => desiredPermissions.includes(permission.code));
    if (permissionRows.length > 0) {
      await db.insert(rolePermissions).values(permissionRows.map((permission) => ({ roleId: role[0].id, permissionId: permission.id })));
      bootstrapped = true;
    }
  }
  if (bootstrapped) await writeAuditLog({ userId: user.id, action: "BOOTSTRAP", entityType: "AUTH", details: { role: desiredRole } });
}

export async function userHasPermission(openId: string, permissionCode: string) {
  const db = await getDb();
  if (!db) return false;
  const user = await getUserByOpenId(openId);
  if (!user || !user.isActive) return false;
  await ensureSystemBootstrap(openId);
  const rows = await db.select({ code: permissions.code })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.userId, user.id));
  return rows.some((row) => row.code === permissionCode || row.code === "*");
}

export async function writeAuditLog(input: {
  userId?: number;
  action: string;
  entityType: string;
  entityId?: number;
  details?: unknown;
  ipAddress?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    details: input.details === undefined ? undefined : JSON.stringify(input.details),
    ipAddress: input.ipAddress,
  });
}
