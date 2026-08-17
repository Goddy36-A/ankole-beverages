import {
  boolean,
  int,
  mysqlTable,
  text,
  timestamp,
  varchar,
  unique,
} from "drizzle-orm/mysql-core";

const id = (name = "id") => int(name).autoincrement().primaryKey();
const createdAt = () => timestamp("createdAt").defaultNow().notNull();
const updatedAt = () => timestamp("updatedAt").defaultNow().onUpdateNow().notNull();

export const users = mysqlTable("users", {
  id: id(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 32 }).default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const roles = mysqlTable("roles", {
  id: id(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const permissions = mysqlTable("permissions", {
  id: id(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  description: text("description"),
  createdAt: createdAt(),
});

export const userRoles = mysqlTable("userRoles", {
  id: id(),
  userId: int("userId").notNull(),
  roleId: int("roleId").notNull(),
  createdAt: createdAt(),
}, (table) => ({
  userRoleUnique: unique("userRoleUnique").on(table.userId, table.roleId),
}));

export const rolePermissions = mysqlTable("rolePermissions", {
  id: id(),
  roleId: int("roleId").notNull(),
  permissionId: int("permissionId").notNull(),
  createdAt: createdAt(),
}, (table) => ({
  rolePermissionUnique: unique("rolePermissionUnique").on(table.roleId, table.permissionId),
}));

export const categories = mysqlTable("categories", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const units = mysqlTable("units", {
  id: id(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const packagings = mysqlTable("packagings", {
  id: id(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = mysqlTable("products", {
  id: id(),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  categoryId: int("categoryId").notNull(),
  unitId: int("unitId").notNull(),
  packagingId: int("packagingId"),
  brand: varchar("brand", { length: 100 }),
  size: varchar("size", { length: 50 }),
  description: text("description"),
  costPrice: int("costPrice").default(0).notNull(),
  sellingPrice: int("sellingPrice").default(0).notNull(),
  reorderLevel: int("reorderLevel").default(0).notNull(),
  currentStock: int("currentStock").default(0).notNull(),
  expiryTracking: boolean("expiryTracking").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const suppliers = mysqlTable("suppliers", {
  id: id(),
  supplierNumber: varchar("supplierNumber", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  contactPerson: varchar("contactPerson", { length: 140 }),
  telephone: varchar("telephone", { length: 40 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  location: varchar("location", { length: 140 }),
  taxNumber: varchar("taxNumber", { length: 80 }),
  paymentTerms: varchar("paymentTerms", { length: 120 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const customers = mysqlTable("customers", {
  id: id(),
  customerNumber: varchar("customerNumber", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  customerType: varchar("customerType", { length: 80 }).default("Walk-in").notNull(),
  telephone: varchar("telephone", { length: 40 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  creditLimit: int("creditLimit").default(0).notNull(),
  outstandingBalance: int("outstandingBalance").default(0).notNull(),
  paymentTerms: varchar("paymentTerms", { length: 120 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const paymentMethods = mysqlTable("paymentMethods", {
  id: id(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const purchases = mysqlTable("purchases", {
  id: id(),
  purchaseNumber: varchar("purchaseNumber", { length: 40 }).notNull().unique(),
  supplierId: int("supplierId").notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 80 }),
  status: varchar("status", { length: 30 }).default("DRAFT").notNull(),
  totalAmount: int("totalAmount").default(0).notNull(),
  notes: text("notes"),
  createdBy: int("createdBy").notNull(),
  receivedBy: int("receivedBy"),
  receivedAt: timestamp("receivedAt"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const purchaseItems = mysqlTable("purchaseItems", {
  id: id(),
  purchaseId: int("purchaseId").notNull(),
  productId: int("productId").notNull(),
  quantity: int("quantity").notNull(),
  unitCost: int("unitCost").notNull(),
  lineTotal: int("lineTotal").notNull(),
  expiryDate: timestamp("expiryDate"),
  createdAt: createdAt(),
});

export const sales = mysqlTable("sales", {
  id: id(),
  invoiceNumber: varchar("invoiceNumber", { length: 40 }).notNull().unique(),
  customerId: int("customerId").notNull(),
  status: varchar("status", { length: 30 }).default("COMPLETED").notNull(),
  saleType: varchar("saleType", { length: 20 }).default("CASH").notNull(),
  subtotal: int("subtotal").default(0).notNull(),
  discount: int("discount").default(0).notNull(),
  tax: int("tax").default(0).notNull(),
  totalAmount: int("totalAmount").default(0).notNull(),
  amountPaid: int("amountPaid").default(0).notNull(),
  balance: int("balance").default(0).notNull(),
  dueDate: timestamp("dueDate"),
  notes: text("notes"),
  createdBy: int("createdBy").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const saleItems = mysqlTable("saleItems", {
  id: id(),
  saleId: int("saleId").notNull(),
  productId: int("productId").notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: int("unitPrice").notNull(),
  unitCost: int("unitCost").notNull(),
  lineTotal: int("lineTotal").notNull(),
  returnedQuantity: int("returnedQuantity").default(0).notNull(),
  createdAt: createdAt(),
});

export const payments = mysqlTable("payments", {
  id: id(),
  receiptNumber: varchar("receiptNumber", { length: 40 }).notNull().unique(),
  saleId: int("saleId").notNull(),
  customerId: int("customerId").notNull(),
  paymentMethodId: int("paymentMethodId").notNull(),
  amount: int("amount").notNull(),
  referenceNumber: varchar("referenceNumber", { length: 120 }),
  notes: text("notes"),
  receivedBy: int("receivedBy").notNull(),
  createdAt: createdAt(),
});

export const stockMovements = mysqlTable("stockMovements", {
  id: id(),
  productId: int("productId").notNull(),
  movementType: varchar("movementType", { length: 30 }).notNull(),
  quantity: int("quantity").notNull(),
  referenceType: varchar("referenceType", { length: 40 }),
  referenceId: int("referenceId"),
  reason: text("reason"),
  performedBy: int("performedBy").notNull(),
  createdAt: createdAt(),
});

export const stockAdjustments = mysqlTable("stockAdjustments", {
  id: id(),
  adjustmentNumber: varchar("adjustmentNumber", { length: 40 }).notNull().unique(),
  productId: int("productId").notNull(),
  adjustmentType: varchar("adjustmentType", { length: 20 }).notNull(),
  quantity: int("quantity").notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).default("PENDING").notNull(),
  requestedBy: int("requestedBy").notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: createdAt(),
});

export const stockCounts = mysqlTable("stockCounts", {
  id: id(),
  countNumber: varchar("countNumber", { length: 40 }).notNull().unique(),
  status: varchar("status", { length: 20 }).default("OPEN").notNull(),
  countedBy: int("countedBy").notNull(),
  approvedBy: int("approvedBy"),
  createdAt: createdAt(),
  approvedAt: timestamp("approvedAt"),
});

export const stockCountItems = mysqlTable("stockCountItems", {
  id: id(),
  stockCountId: int("stockCountId").notNull(),
  productId: int("productId").notNull(),
  systemQuantity: int("systemQuantity").notNull(),
  countedQuantity: int("countedQuantity").notNull(),
  variance: int("variance").notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
});

export const salesReturns = mysqlTable("salesReturns", {
  id: id(),
  returnNumber: varchar("returnNumber", { length: 40 }).notNull().unique(),
  saleId: int("saleId").notNull(),
  customerId: int("customerId").notNull(),
  status: varchar("status", { length: 20 }).default("APPROVED").notNull(),
  totalAmount: int("totalAmount").default(0).notNull(),
  reason: text("reason").notNull(),
  processedBy: int("processedBy").notNull(),
  createdAt: createdAt(),
});

export const salesReturnItems = mysqlTable("salesReturnItems", {
  id: id(),
  salesReturnId: int("salesReturnId").notNull(),
  saleItemId: int("saleItemId").notNull(),
  productId: int("productId").notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: int("unitPrice").notNull(),
  lineTotal: int("lineTotal").notNull(),
  createdAt: createdAt(),
});

export const purchaseReturns = mysqlTable("purchaseReturns", {
  id: id(),
  returnNumber: varchar("returnNumber", { length: 40 }).notNull().unique(),
  purchaseId: int("purchaseId").notNull(),
  supplierId: int("supplierId").notNull(),
  status: varchar("status", { length: 20 }).default("APPROVED").notNull(),
  totalAmount: int("totalAmount").default(0).notNull(),
  reason: text("reason").notNull(),
  processedBy: int("processedBy").notNull(),
  createdAt: createdAt(),
});

export const purchaseReturnItems = mysqlTable("purchaseReturnItems", {
  id: id(),
  purchaseReturnId: int("purchaseReturnId").notNull(),
  purchaseItemId: int("purchaseItemId").notNull(),
  productId: int("productId").notNull(),
  quantity: int("quantity").notNull(),
  unitCost: int("unitCost").notNull(),
  lineTotal: int("lineTotal").notNull(),
  createdAt: createdAt(),
});

export const auditLogs = mysqlTable("auditLogs", {
  id: id(),
  userId: int("userId"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: int("entityId"),
  details: text("details"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: createdAt(),
});

export const notifications = mysqlTable("notifications", {
  id: id(),
  userId: int("userId"),
  title: varchar("title", { length: 160 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 40 }).default("INFO").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: createdAt(),
});

export const systemSettings = mysqlTable("systemSettings", {
  id: id(),
  settingKey: varchar("settingKey", { length: 100 }).notNull().unique(),
  settingValue: text("settingValue").notNull(),
  description: text("description"),
  updatedBy: int("updatedBy"),
  updatedAt: updatedAt(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
