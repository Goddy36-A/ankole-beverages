import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, categories, customers, paymentMethods, payments, products, purchaseItems, purchases, saleItems, sales, stockMovements, systemSettings } from "../../drizzle/schema";
import { getDb, userHasPermission } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

async function requirePermission(ctx: { user: { openId: string; id: number } }, permission: string) {
  if (!(await userHasPermission(ctx.user.openId, permission))) throw new TRPCError({ code: "FORBIDDEN", message: `Permission required: ${permission}` });
}

function range(input: { from?: string; to?: string }) {
  const from = input.from ? new Date(`${input.from}T00:00:00`) : new Date(0);
  const to = input.to ? new Date(`${input.to}T23:59:59.999`) : new Date();
  return { from, to };
}

function inRange(date: Date, bounds: { from: Date; to: Date }) {
  return date >= bounds.from && date <= bounds.to;
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "No records\n";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
}

function toExcelXml(rows: Record<string, unknown>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const cell = (value: unknown) => `<Cell><Data ss:Type="String">${String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</Data></Cell>`;
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table><Row>${headers.map(cell).join("")}</Row>${rows.map((row) => `<Row>${headers.map((header) => cell(row[header])).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`;
}

export const reportingRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "dashboard.view");
    const db = await getDb();
    if (!db) return { totals: { products: 0, stockUnits: 0, stockValue: 0, todaySales: 0, todayRevenue: 0, monthlyRevenue: 0, outstanding: 0 }, lowStock: [], recentSales: [], recentPurchases: [], topProducts: [] };
    const [productRows, salesRows, customerRows, purchaseRows, movementRows] = await Promise.all([
      db.select().from(products),
      db.select().from(sales).orderBy(desc(sales.createdAt)).limit(500),
      db.select().from(customers),
      db.select().from(purchases).orderBy(desc(purchases.createdAt)).limit(100),
      db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(500),
    ]);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const completed = salesRows.filter((sale) => sale.status === "COMPLETED");
    const today = completed.filter((sale) => new Date(sale.createdAt) >= startToday);
    const month = completed.filter((sale) => new Date(sale.createdAt) >= startMonth);
    const stockUnits = productRows.reduce((sum, product) => sum + product.currentStock, 0);
    const stockValue = productRows.reduce((sum, product) => sum + product.currentStock * product.costPrice, 0);
    const lowStock = productRows.filter((product) => product.currentStock <= product.reorderLevel).sort((a, b) => a.currentStock - b.currentStock).slice(0, 8);
    const productSales = new Map<number, number>();
    for (const movement of movementRows.filter((movement) => movement.movementType === "SALE")) productSales.set(movement.productId, (productSales.get(movement.productId) ?? 0) + Math.abs(movement.quantity));
    const topProducts = Array.from(productSales.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([productId, quantity]) => ({ ...productRows.find((product) => product.id === productId), quantity }));
    return {
      totals: { products: productRows.filter((product) => product.isActive).length, stockUnits, stockValue, todaySales: today.length, todayRevenue: today.reduce((sum, sale) => sum + sale.totalAmount, 0), monthlyRevenue: month.reduce((sum, sale) => sum + sale.totalAmount, 0), outstanding: customerRows.reduce((sum, customer) => sum + customer.outstandingBalance, 0) },
      lowStock, recentSales: salesRows.slice(0, 6), recentPurchases: purchaseRows.slice(0, 6), topProducts,
    };
  }),

  salesReport: protectedProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional(), productId: z.number().int().positive().optional(), categoryId: z.number().int().positive().optional(), customerId: z.number().int().positive().optional(), userId: z.number().int().positive().optional() }).default({})).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "reports.view");
    const db = await getDb();
    if (!db) return { rows: [], summary: { total: 0, revenue: 0, paid: 0, balance: 0 } };
    const bounds = range(input);
    const salesRows = (await db.select().from(sales)).filter((sale) => inRange(new Date(sale.createdAt), bounds) && (!input.customerId || sale.customerId === input.customerId) && (!input.userId || sale.createdBy === input.userId));
    const items = await db.select().from(saleItems);
    const productRows = await db.select().from(products);
    const itemRows = items.filter((item) => salesRows.some((sale) => sale.id === item.saleId) && (!input.productId || item.productId === input.productId) && (!input.categoryId || productRows.find((product) => product.id === item.productId)?.categoryId === input.categoryId));
    const relevantSaleIds = new Set(itemRows.map((item) => item.saleId));
    const rows = salesRows.filter((sale) => !input.productId && !input.categoryId || relevantSaleIds.has(sale.id)).map((sale) => ({ invoiceNumber: sale.invoiceNumber, date: new Date(sale.createdAt).toISOString().slice(0, 10), customerId: sale.customerId, saleType: sale.saleType, subtotal: sale.subtotal, discount: sale.discount, tax: sale.tax, totalAmount: sale.totalAmount, amountPaid: sale.amountPaid, balance: sale.balance }));
    return { rows, summary: { total: rows.length, revenue: rows.reduce((sum, row) => sum + row.totalAmount, 0), paid: rows.reduce((sum, row) => sum + row.amountPaid, 0), balance: rows.reduce((sum, row) => sum + row.balance, 0) } };
  }),

  currencyConfig: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "dashboard.view");
    const db = await getDb();
    if (!db) return { currency: "UGX" };
    const setting = (await db.select().from(systemSettings).where(eq(systemSettings.settingKey, "currency")).limit(1))[0];
    return { currency: setting?.settingValue || "UGX" };
  }),
  customerBalances: protectedProcedure.input(z.object({ overdueOnly: z.boolean().optional() }).default({})).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "reports.view");
    const db = await getDb();
    if (!db) return [];
    const customerRows = await db.select().from(customers);
    const salesRows = await db.select().from(sales);
    const now = new Date();
    return customerRows.map((customer) => {
      const invoices = salesRows.filter((sale) => sale.customerId === customer.id && sale.balance > 0);
      const overdueAmount = invoices.filter((sale) => sale.dueDate && sale.dueDate < now).reduce((sum, sale) => sum + sale.balance, 0);
      return { ...customer, overdueAmount, status: overdueAmount > 0 ? "OVERDUE" : customer.outstandingBalance > 0 ? "OUTSTANDING" : "CLEAR" };
    }).filter((customer) => !input.overdueOnly || customer.overdueAmount > 0);
  }),
  inventoryReport: protectedProcedure.input(z.object({ lowStockOnly: z.boolean().optional(), movementType: z.string().optional(), from: z.string().optional(), to: z.string().optional() }).default({})).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "reports.view");
    const db = await getDb();
    if (!db) return { stock: [], movements: [] };
    const stock = await db.select().from(products);
    const movements = await db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(500);
    const bounds = range(input);
    const dateFilteredMovements = movements.filter((movement) => inRange(new Date(movement.createdAt), bounds));
    return { stock: input.lowStockOnly ? stock.filter((product) => product.currentStock <= product.reorderLevel) : stock, movements: input.movementType ? dateFilteredMovements.filter((movement) => movement.movementType === input.movementType) : dateFilteredMovements };
  }),

  purchaseReport: protectedProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional(), supplierId: z.number().int().positive().optional() }).default({})).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "reports.view");
    const db = await getDb();
    if (!db) return { rows: [], total: 0 };
    const bounds = range(input);
    const rows = (await db.select().from(purchases)).filter((purchase) => inRange(new Date(purchase.createdAt), bounds) && (!input.supplierId || purchase.supplierId === input.supplierId)).map((purchase) => ({ purchaseNumber: purchase.purchaseNumber, date: new Date(purchase.createdAt).toISOString().slice(0, 10), supplierId: purchase.supplierId, status: purchase.status, totalAmount: purchase.totalAmount }));
    return { rows, total: rows.reduce((sum, row) => sum + row.totalAmount, 0) };
  }),

  customerStatement: protectedProcedure.input(z.object({ customerId: z.number().int().positive(), from: z.string().optional(), to: z.string().optional() })).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "reports.view");
    const db = await getDb();
    if (!db) return { customer: null, sales: [], payments: [] };
    const customer = (await db.select().from(customers).where(eq(customers.id, input.customerId)).limit(1))[0] ?? null;
    const bounds = range(input);
    const salesRows = (await db.select().from(sales).where(eq(sales.customerId, input.customerId))).filter((sale) => inRange(new Date(sale.createdAt), bounds));
    const paymentsRows = (await db.select().from(payments).where(eq(payments.customerId, input.customerId))).filter((payment) => inRange(new Date(payment.createdAt), bounds));
    return { customer, sales: salesRows, payments: paymentsRows };
  }),

  auditLogs: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) })).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "audit.view");
    const db = await getDb();
    return db ? db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(input.limit) : [];
  }),

  exportReport: protectedProcedure.input(z.object({ report: z.enum(["sales", "inventory", "purchases"]), format: z.enum(["csv", "excel"]), from: z.string().optional(), to: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "reports.export");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    let rows: Record<string, unknown>[] = [];
    if (input.report === "sales") {
      const bounds = range(input);
      rows = (await db.select().from(sales)).filter((sale) => inRange(new Date(sale.createdAt), bounds)).map((sale) => ({ invoiceNumber: sale.invoiceNumber, date: new Date(sale.createdAt).toISOString(), customerId: sale.customerId, type: sale.saleType, total: sale.totalAmount, paid: sale.amountPaid, balance: sale.balance }));
    } else if (input.report === "inventory") {
      rows = (await db.select().from(products)).map((product) => ({ sku: product.sku, product: product.name, stock: product.currentStock, reorderLevel: product.reorderLevel, costPrice: product.costPrice, stockValue: product.currentStock * product.costPrice, status: product.isActive ? "Active" : "Inactive" }));
    } else {
      const bounds = range(input);
      rows = (await db.select().from(purchases)).filter((purchase) => inRange(new Date(purchase.createdAt), bounds)).map((purchase) => ({ purchaseNumber: purchase.purchaseNumber, date: new Date(purchase.createdAt).toISOString(), supplierId: purchase.supplierId, status: purchase.status, total: purchase.totalAmount }));
    }
    const content = input.format === "csv" ? toCsv(rows) : toExcelXml(rows);
    return { filename: `${input.report}-report.${input.format === "csv" ? "csv" : "xls"}`, content, mimeType: input.format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.ms-excel" };
  }),
});
