import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";
import {
  categories,
  customers,
  packagings,
  paymentMethods,
  products,
  suppliers,
  units,
} from "../../drizzle/schema";
import { getDb, userHasPermission, writeAuditLog } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

async function requirePermission(ctx: { user: { openId: string; id: number } }, permission: string) {
  if (!(await userHasPermission(ctx.user.openId, permission))) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Permission required: ${permission}` });
  }
}

const activeFlag = z.boolean().optional();
const nonNegativeMoney = z.number().int().min(0);
const positiveInt = z.number().int().positive();

export const catalogRouter = router({
  bootstrap: protectedProcedure.mutation(async ({ ctx }) => {
    await requirePermission(ctx, "dashboard.view");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return { success: true };
  }),

  categories: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "catalog.view");
    const db = await getDb();
    return db ? db.select().from(categories).orderBy(categories.name) : [];
  }),
  createCategory: protectedProcedure.input(z.object({ name: z.string().min(2), description: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "catalog.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const result = await db.insert(categories).values(input);
    await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "CATEGORY", entityId: result[0].insertId, details: input });
    return { id: result[0].insertId };
  }),
  updateCategory: protectedProcedure.input(z.object({ id: positiveInt, name: z.string().min(2).optional(), description: z.string().nullable().optional(), isActive: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "catalog.manage");
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const { id, ...values } = input; await db.update(categories).set(values).where(eq(categories.id, id)); await writeAuditLog({ userId: ctx.user.id, action: "UPDATE", entityType: "CATEGORY", entityId: id, details: values }); return { success: true };
  }),

  units: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "catalog.view");
    const db = await getDb();
    return db ? db.select().from(units).orderBy(units.name) : [];
  }),
  createUnit: protectedProcedure.input(z.object({ name: z.string().min(1), symbol: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "catalog.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const result = await db.insert(units).values(input);
    await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "UNIT", entityId: result[0].insertId, details: input });
    return { id: result[0].insertId };
  }),
  updateUnit: protectedProcedure.input(z.object({ id: positiveInt, name: z.string().min(1).optional(), symbol: z.string().min(1).optional(), isActive: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "catalog.manage");
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const { id, ...values } = input; await db.update(units).set(values).where(eq(units.id, id)); await writeAuditLog({ userId: ctx.user.id, action: "UPDATE", entityType: "UNIT", entityId: id, details: values }); return { success: true };
  }),

  packagings: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "catalog.view");
    const db = await getDb();
    return db ? db.select().from(packagings).orderBy(packagings.name) : [];
  }),
  createPackaging: protectedProcedure.input(z.object({ name: z.string().min(1), description: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "catalog.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const result = await db.insert(packagings).values(input);
    await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "PACKAGING", entityId: result[0].insertId, details: input });
    return { id: result[0].insertId };
  }),
  updatePackaging: protectedProcedure.input(z.object({ id: positiveInt, name: z.string().min(1).optional(), description: z.string().nullable().optional(), isActive: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "catalog.manage");
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const { id, ...values } = input; await db.update(packagings).set(values).where(eq(packagings.id, id)); await writeAuditLog({ userId: ctx.user.id, action: "UPDATE", entityType: "PACKAGING", entityId: id, details: values }); return { success: true };
  }),

  products: protectedProcedure.input(z.object({ search: z.string().optional(), activeOnly: z.boolean().optional() }).optional()).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "catalog.view");
    const db = await getDb();
    if (!db) return [];
    const conditions = [];
    if (input?.search) conditions.push(or(like(products.name, `%${input.search}%`), like(products.sku, `%${input.search}%`)));
    if (input?.activeOnly) conditions.push(eq(products.isActive, true));
    return db.select({
      id: products.id, sku: products.sku, name: products.name, brand: products.brand, size: products.size,
      costPrice: products.costPrice, sellingPrice: products.sellingPrice, reorderLevel: products.reorderLevel,
      currentStock: products.currentStock, expiryTracking: products.expiryTracking, isActive: products.isActive,
      categoryId: products.categoryId, categoryName: categories.name, unitId: products.unitId, unitName: units.name,
      packagingId: products.packagingId, packagingName: packagings.name,
    }).from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(units, eq(products.unitId, units.id))
      .leftJoin(packagings, eq(products.packagingId, packagings.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(products.createdAt));
  }),

  createProduct: protectedProcedure.input(z.object({
    sku: z.string().min(2), name: z.string().min(2), categoryId: positiveInt, unitId: positiveInt, packagingId: positiveInt.optional(),
    brand: z.string().optional(), size: z.string().optional(), description: z.string().optional(), costPrice: nonNegativeMoney,
    sellingPrice: nonNegativeMoney, reorderLevel: z.number().int().min(0), expiryTracking: z.boolean().default(false), isActive: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "catalog.manage");
    if (input.sellingPrice < input.costPrice) throw new TRPCError({ code: "BAD_REQUEST", message: "Selling price cannot be below cost price" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const result = await db.insert(products).values(input);
    await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "PRODUCT", entityId: result[0].insertId, details: input });
    return { id: result[0].insertId };
  }),

  updateProduct: protectedProcedure.input(z.object({
    id: positiveInt, name: z.string().min(2).optional(), categoryId: positiveInt.optional(), unitId: positiveInt.optional(), packagingId: positiveInt.nullable().optional(),
    brand: z.string().nullable().optional(), size: z.string().nullable().optional(), description: z.string().nullable().optional(), costPrice: nonNegativeMoney.optional(),
    sellingPrice: nonNegativeMoney.optional(), reorderLevel: z.number().int().min(0).optional(), expiryTracking: activeFlag, isActive: activeFlag,
  })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "catalog.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const current = await db.select().from(products).where(eq(products.id, input.id)).limit(1);
    if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
    const nextCost = input.costPrice ?? current[0].costPrice;
    const nextSelling = input.sellingPrice ?? current[0].sellingPrice;
    if (nextSelling < nextCost) throw new TRPCError({ code: "BAD_REQUEST", message: "Selling price cannot be below cost price" });
    const { id, ...values } = input;
    await db.update(products).set(values).where(eq(products.id, id));
    await writeAuditLog({ userId: ctx.user.id, action: "UPDATE", entityType: "PRODUCT", entityId: id, details: values });
    return { success: true };
  }),

  suppliers: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "partners.manage");
    const db = await getDb();
    if (!db) return [];
    return db.select().from(suppliers).where(input?.search ? or(like(suppliers.name, `%${input.search}%`), like(suppliers.supplierNumber, `%${input.search}%`)) : undefined).orderBy(desc(suppliers.createdAt));
  }),
  createSupplier: protectedProcedure.input(z.object({ name: z.string().min(2), contactPerson: z.string().optional(), telephone: z.string().optional(), email: z.string().email().optional(), address: z.string().optional(), location: z.string().optional(), taxNumber: z.string().optional(), paymentTerms: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "partners.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const supplierNumber = `SUP-${Date.now().toString().slice(-8)}`;
    const result = await db.insert(suppliers).values({ ...input, supplierNumber });
    await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "SUPPLIER", entityId: result[0].insertId, details: input });
    return { id: result[0].insertId, supplierNumber };
  }),

  customers: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "partners.manage");
    const db = await getDb();
    if (!db) return [];
    return db.select().from(customers).where(input?.search ? or(like(customers.name, `%${input.search}%`), like(customers.customerNumber, `%${input.search}%`), like(customers.telephone, `%${input.search}%`)) : undefined).orderBy(desc(customers.createdAt));
  }),
  createCustomer: protectedProcedure.input(z.object({ name: z.string().min(2), customerType: z.string().min(2).default("Walk-in"), telephone: z.string().optional(), email: z.string().email().optional(), address: z.string().optional(), creditLimit: nonNegativeMoney.default(0), paymentTerms: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "partners.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const customerNumber = `CUS-${Date.now().toString().slice(-8)}`;
    const result = await db.insert(customers).values({ ...input, customerNumber });
    await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "CUSTOMER", entityId: result[0].insertId, details: input });
    return { id: result[0].insertId, customerNumber };
  }),
  updateSupplier: protectedProcedure.input(z.object({ id: positiveInt, name: z.string().min(2).optional(), telephone: z.string().nullable().optional(), email: z.string().email().nullable().optional(), address: z.string().nullable().optional(), location: z.string().nullable().optional(), isActive: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "partners.manage");
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const { id, ...values } = input; await db.update(suppliers).set(values).where(eq(suppliers.id, id)); await writeAuditLog({ userId: ctx.user.id, action: "UPDATE", entityType: "SUPPLIER", entityId: id, details: values }); return { success: true };
  }),
  updateCustomer: protectedProcedure.input(z.object({ id: positiveInt, name: z.string().min(2).optional(), telephone: z.string().nullable().optional(), email: z.string().email().nullable().optional(), address: z.string().nullable().optional(), customerType: z.string().optional(), isActive: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "partners.manage");
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const { id, ...values } = input; await db.update(customers).set(values).where(eq(customers.id, id)); await writeAuditLog({ userId: ctx.user.id, action: "UPDATE", entityType: "CUSTOMER", entityId: id, details: values }); return { success: true };
  }),
  updateCustomerCredit: protectedProcedure.input(z.object({ id: positiveInt, creditLimit: nonNegativeMoney })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "partners.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    await db.update(customers).set({ creditLimit: input.creditLimit }).where(eq(customers.id, input.id));
    await writeAuditLog({ userId: ctx.user.id, action: "UPDATE_CREDIT_LIMIT", entityType: "CUSTOMER", entityId: input.id, details: input });
    return { success: true };
  }),

  paymentMethods: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "payments.manage");
    const db = await getDb();
    return db ? db.select().from(paymentMethods).where(eq(paymentMethods.isActive, true)).orderBy(paymentMethods.name) : [];
  }),
  createPaymentMethod: protectedProcedure.input(z.object({ name: z.string().min(2), description: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "settings.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const result = await db.insert(paymentMethods).values(input);
    await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "PAYMENT_METHOD", entityId: result[0].insertId, details: input });
    return { id: result[0].insertId };
  }),
});
