import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  customers,
  paymentMethods,
  payments,
  products,
  purchaseItems,
  purchaseReturnItems,
  purchaseReturns,
  purchases,
  saleItems,
  sales,
  salesReturnItems,
  salesReturns,
  stockAdjustments,
  stockCountItems,
  stockCounts,
  stockMovements,
  suppliers,
} from "../../drizzle/schema";
import { getDb, userHasPermission, writeAuditLog } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const positive = z.number().int().positive();
const nonNegative = z.number().int().min(0);
const itemInput = z.object({ productId: positive, quantity: positive, unitPrice: nonNegative.optional() });

async function requirePermission(ctx: { user: { openId: string; id: number } }, permission: string) {
  if (!(await userHasPermission(ctx.user.openId, permission))) throw new TRPCError({ code: "FORBIDDEN", message: `Permission required: ${permission}` });
}

function ref(prefix: string) {
  return `${prefix}-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 90 + 10)}`;
}

export const operationsRouter = router({
  purchases: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "purchases.view");
    const db = await getDb();
    return db ? db.select().from(purchases).orderBy(desc(purchases.createdAt)).limit(100) : [];
  }),
  createPurchase: protectedProcedure.input(z.object({ supplierId: positive, invoiceNumber: z.string().optional(), notes: z.string().optional(), items: z.array(z.object({ productId: positive, quantity: positive, unitCost: nonNegative, expiryDate: z.string().optional() })).min(1) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "purchases.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.transaction(async (tx) => {
      const supplier = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
      if (!supplier[0] || !supplier[0].isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Active supplier is required" });
      const productIds = input.items.map((item) => item.productId);
      const productRows = await tx.select().from(products).where(inArray(products.id, productIds));
      if (productRows.length !== new Set(productIds).size) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more products do not exist" });
      const productMap = new Map(productRows.map((product) => [product.id, product]));
      const normalizedItems = input.items.map((item) => ({ ...item, lineTotal: item.quantity * item.unitCost, expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined }));
      const totalAmount = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const result = await tx.insert(purchases).values({ purchaseNumber: ref("PO"), supplierId: input.supplierId, invoiceNumber: input.invoiceNumber, notes: input.notes, totalAmount, createdBy: ctx.user.id });
      const purchaseId = result[0].insertId;
      await tx.insert(purchaseItems).values(normalizedItems.map((item) => ({ purchaseId, productId: item.productId, quantity: item.quantity, unitCost: item.unitCost, lineTotal: item.lineTotal, expiryDate: item.expiryDate })));
      await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "PURCHASE", entityId: purchaseId, details: { ...input, totalAmount, productNames: input.items.map((item) => productMap.get(item.productId)?.name) } });
      return { id: purchaseId, totalAmount };
    });
  }),
  receivePurchase: protectedProcedure.input(z.object({ purchaseId: positive })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "purchases.receive");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.transaction(async (tx) => {
      const purchase = await tx.select().from(purchases).where(eq(purchases.id, input.purchaseId)).limit(1);
      if (!purchase[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase not found" });
      if (purchase[0].status === "RECEIVED") throw new TRPCError({ code: "BAD_REQUEST", message: "Purchase has already been received" });
      const items = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, input.purchaseId));
      if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Purchase has no items" });
      for (const item of items) {
        const product = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (!product[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Purchase item product no longer exists" });
        await tx.update(products).set({ currentStock: product[0].currentStock + item.quantity }).where(eq(products.id, item.productId));
        await tx.insert(stockMovements).values({ productId: item.productId, movementType: "PURCHASE", quantity: item.quantity, referenceType: "PURCHASE", referenceId: input.purchaseId, performedBy: ctx.user.id, reason: "Confirmed purchase receipt" });
      }
      await tx.update(purchases).set({ status: "RECEIVED", receivedBy: ctx.user.id, receivedAt: new Date() }).where(eq(purchases.id, input.purchaseId));
      await writeAuditLog({ userId: ctx.user.id, action: "RECEIVE", entityType: "PURCHASE", entityId: input.purchaseId });
      return { success: true };
    });
  }),

  sales: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "sales.view");
    const db = await getDb();
    return db ? db.select().from(sales).orderBy(desc(sales.createdAt)).limit(100) : [];
  }),
  saleDetails: protectedProcedure.input(z.object({ saleId: positive })).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "sales.view");
    const db = await getDb();
    if (!db) return { sale: null, items: [] };
    const sale = (await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1))[0] ?? null;
    if (!sale) return { sale: null, items: [] };
    const items = await db.select({ id: saleItems.id, productId: saleItems.productId, productName: products.name, sku: products.sku, quantity: saleItems.quantity, returnedQuantity: saleItems.returnedQuantity, unitPrice: saleItems.unitPrice, lineTotal: saleItems.lineTotal }).from(saleItems).innerJoin(products, eq(saleItems.productId, products.id)).where(eq(saleItems.saleId, input.saleId));
    return { sale, items };
  }),
  createSale: protectedProcedure.input(z.object({
    customerId: positive, saleType: z.enum(["CASH", "CREDIT"]), discount: nonNegative.default(0), tax: nonNegative.default(0), amountPaid: nonNegative,
    paymentMethodId: positive.optional(), paymentReference: z.string().optional(), notes: z.string().optional(), items: z.array(itemInput).min(1),
  })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "sales.create");
    if (input.discount > 0) await requirePermission(ctx, "sales.discount");
    if (input.amountPaid > 0 && !input.paymentMethodId) throw new TRPCError({ code: "BAD_REQUEST", message: "A payment method is required when amount paid is greater than zero" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.transaction(async (tx) => {
      const customer = await tx.select().from(customers).where(eq(customers.id, input.customerId)).limit(1);
      if (!customer[0] || !customer[0].isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Active customer is required" });
      if (input.paymentMethodId) {
        const method = await tx.select().from(paymentMethods).where(and(eq(paymentMethods.id, input.paymentMethodId), eq(paymentMethods.isActive, true))).limit(1);
        if (!method[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment method is not active" });
      }
      const productIds = input.items.map((item) => item.productId);
      const productRows = await tx.select().from(products).where(inArray(products.id, productIds));
      const productMap = new Map(productRows.map((product) => [product.id, product]));
      if (productRows.length !== new Set(productIds).size) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more products do not exist" });
      let subtotal = 0;
      const normalizedItems = input.items.map((item) => {
        const product = productMap.get(item.productId)!;
        const unitPrice = item.unitPrice ?? product.sellingPrice;
        if (!product.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: `${product.name} is inactive and cannot be sold` });
        if (unitPrice < product.costPrice) throw new TRPCError({ code: "BAD_REQUEST", message: `Sale price for ${product.name} cannot be below cost price` });
        if (unitPrice !== product.sellingPrice && input.discount <= 0) throw new TRPCError({ code: "FORBIDDEN", message: "Price overrides require discount permission" });
        if (item.quantity > product.currentStock) throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient stock for ${product.name}. Available: ${product.currentStock}` });
        const lineTotal = item.quantity * unitPrice;
        subtotal += lineTotal;
        return { ...item, unitPrice, unitCost: product.costPrice, lineTotal };
      });
      const totalAmount = subtotal - input.discount + input.tax;
      if (totalAmount < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Discount cannot exceed the sale subtotal plus tax" });
      if (input.amountPaid > totalAmount) throw new TRPCError({ code: "BAD_REQUEST", message: "Amount paid cannot exceed the invoice total" });
      const balance = totalAmount - input.amountPaid;
      if (input.saleType === "CASH" && balance > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Cash sales must be fully paid; use credit for an outstanding balance" });
      if (input.saleType === "CREDIT" && customer[0].outstandingBalance + balance > customer[0].creditLimit) {
        await requirePermission(ctx, "sales.credit.override");
      }
      const result = await tx.insert(sales).values({ invoiceNumber: ref("INV"), customerId: input.customerId, saleType: input.saleType, subtotal, discount: input.discount, tax: input.tax, totalAmount, amountPaid: input.amountPaid, balance, dueDate: input.saleType === "CREDIT" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined, notes: input.notes, createdBy: ctx.user.id });
      const saleId = result[0].insertId;
      await tx.insert(saleItems).values(normalizedItems.map((item) => ({ saleId, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, unitCost: item.unitCost, lineTotal: item.lineTotal })));
      for (const item of normalizedItems) {
        const product = productMap.get(item.productId)!;
        await tx.update(products).set({ currentStock: product.currentStock - item.quantity }).where(eq(products.id, item.productId));
        await tx.insert(stockMovements).values({ productId: item.productId, movementType: "SALE", quantity: -item.quantity, referenceType: "SALE", referenceId: saleId, performedBy: ctx.user.id, reason: "Confirmed sale" });
      }
      if (input.amountPaid > 0) {
        await tx.insert(payments).values({ receiptNumber: ref("RCT"), saleId, customerId: input.customerId, paymentMethodId: input.paymentMethodId!, amount: input.amountPaid, referenceNumber: input.paymentReference, receivedBy: ctx.user.id });
      }
      if (balance > 0) await tx.update(customers).set({ outstandingBalance: customer[0].outstandingBalance + balance }).where(eq(customers.id, input.customerId));
      await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "SALE", entityId: saleId, details: { ...input, subtotal, totalAmount, balance } });
      return { id: saleId, invoiceNumber: (await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1))[0]?.invoiceNumber, subtotal, totalAmount, balance };
    });
  }),
  recordPayment: protectedProcedure.input(z.object({ saleId: positive, amount: positive, paymentMethodId: positive, referenceNumber: z.string().optional(), notes: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "payments.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.transaction(async (tx) => {
      const sale = await tx.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found" });
      if (input.amount > sale[0].balance) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment cannot exceed outstanding balance" });
      const method = await tx.select().from(paymentMethods).where(and(eq(paymentMethods.id, input.paymentMethodId), eq(paymentMethods.isActive, true))).limit(1);
      if (!method[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Payment method is not active" });
      const nextBalance = sale[0].balance - input.amount;
      await tx.update(sales).set({ amountPaid: sale[0].amountPaid + input.amount, balance: nextBalance }).where(eq(sales.id, input.saleId));
      const currentCustomer = (await tx.select().from(customers).where(eq(customers.id, sale[0].customerId)).limit(1))[0];
      await tx.update(customers).set({ outstandingBalance: Math.max(0, (currentCustomer?.outstandingBalance ?? 0) - input.amount) }).where(eq(customers.id, sale[0].customerId));
      const result = await tx.insert(payments).values({ receiptNumber: ref("RCT"), saleId: input.saleId, customerId: sale[0].customerId, paymentMethodId: input.paymentMethodId, amount: input.amount, referenceNumber: input.referenceNumber, notes: input.notes, receivedBy: ctx.user.id });
      await writeAuditLog({ userId: ctx.user.id, action: "RECORD_PAYMENT", entityType: "PAYMENT", entityId: result[0].insertId, details: input });
      return { id: result[0].insertId, balance: nextBalance };
    });
  }),

  inventoryAlerts: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "inventory.view");
    const db = await getDb();
    if (!db) return { lowStock: [], outOfStock: [], expiring: [] };
    const productRows = await db.select().from(products);
    const purchaseRows = await db.select().from(purchaseItems);
    const threshold = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return { lowStock: productRows.filter((product) => product.currentStock > 0 && product.currentStock <= product.reorderLevel), outOfStock: productRows.filter((product) => product.currentStock === 0 && product.isActive), expiring: purchaseRows.filter((item) => item.expiryDate && item.expiryDate <= threshold && item.expiryDate >= new Date()).map((item) => ({ productId: item.productId, expiryDate: item.expiryDate, quantity: item.quantity })) };
  }),
  recordStockLoss: protectedProcedure.input(z.object({ productId: positive, movementType: z.enum(["DAMAGE", "EXPIRY", "LOSS"]), quantity: positive, reason: z.string().min(5) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "inventory.adjust.approve");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.transaction(async (tx) => {
      const product = (await tx.select().from(products).where(eq(products.id, input.productId)).limit(1))[0];
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      if (input.quantity > product.currentStock) throw new TRPCError({ code: "BAD_REQUEST", message: "Loss quantity cannot exceed available stock" });
      await tx.update(products).set({ currentStock: product.currentStock - input.quantity }).where(eq(products.id, input.productId));
      const movement = await tx.insert(stockMovements).values({ productId: input.productId, movementType: input.movementType, quantity: -input.quantity, reason: input.reason, performedBy: ctx.user.id });
      await writeAuditLog({ userId: ctx.user.id, action: "RECORD", entityType: input.movementType, entityId: movement[0].insertId, details: input });
      return { success: true, currentStock: product.currentStock - input.quantity };
    });
  }),
  requestAdjustment: protectedProcedure.input(z.object({ productId: positive, adjustmentType: z.enum(["IN", "OUT"]), quantity: positive, reason: z.string().min(5) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "inventory.adjust");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const result = await db.insert(stockAdjustments).values({ adjustmentNumber: ref("ADJ"), ...input, status: "PENDING", requestedBy: ctx.user.id });
    await writeAuditLog({ userId: ctx.user.id, action: "REQUEST", entityType: "STOCK_ADJUSTMENT", entityId: result[0].insertId, details: input });
    return { id: result[0].insertId };
  }),
  adjustments: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "inventory.view");
    const db = await getDb();
    return db ? db.select().from(stockAdjustments).orderBy(desc(stockAdjustments.createdAt)).limit(100) : [];
  }),
  approveAdjustment: protectedProcedure.input(z.object({ id: positive })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "inventory.adjust.approve");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.transaction(async (tx) => {
      const adjustment = await tx.select().from(stockAdjustments).where(eq(stockAdjustments.id, input.id)).limit(1);
      if (!adjustment[0] || adjustment[0].status !== "PENDING") throw new TRPCError({ code: "BAD_REQUEST", message: "Pending adjustment not found" });
      const product = await tx.select().from(products).where(eq(products.id, adjustment[0].productId)).limit(1);
      if (!product[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      if (adjustment[0].adjustmentType === "OUT" && adjustment[0].quantity > product[0].currentStock) throw new TRPCError({ code: "BAD_REQUEST", message: "Adjustment would create negative stock" });
      const nextStock = product[0].currentStock + (adjustment[0].adjustmentType === "IN" ? adjustment[0].quantity : -adjustment[0].quantity);
      await tx.update(products).set({ currentStock: nextStock }).where(eq(products.id, product[0].id));
      await tx.insert(stockMovements).values({ productId: product[0].id, movementType: adjustment[0].adjustmentType === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", quantity: adjustment[0].adjustmentType === "IN" ? adjustment[0].quantity : -adjustment[0].quantity, referenceType: "STOCK_ADJUSTMENT", referenceId: input.id, reason: adjustment[0].reason, performedBy: ctx.user.id });
      await tx.update(stockAdjustments).set({ status: "APPROVED", approvedBy: ctx.user.id, approvedAt: new Date() }).where(eq(stockAdjustments.id, input.id));
      await writeAuditLog({ userId: ctx.user.id, action: "APPROVE", entityType: "STOCK_ADJUSTMENT", entityId: input.id });
      return { success: true, currentStock: nextStock };
    });
  }),

  createStockCount: protectedProcedure.input(z.object({ items: z.array(z.object({ productId: positive, countedQuantity: nonNegative, reason: z.string().optional() })).min(1) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "inventory.count");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.transaction(async (tx) => {
      const productRows = await tx.select().from(products).where(inArray(products.id, input.items.map((item) => item.productId)));
      const map = new Map(productRows.map((product) => [product.id, product]));
      if (map.size !== new Set(input.items.map((item) => item.productId)).size) throw new TRPCError({ code: "BAD_REQUEST", message: "Every stock count item must reference a product" });
      const result = await tx.insert(stockCounts).values({ countNumber: ref("COUNT"), countedBy: ctx.user.id });
      const stockCountId = result[0].insertId;
      await tx.insert(stockCountItems).values(input.items.map((item) => ({ stockCountId, productId: item.productId, systemQuantity: map.get(item.productId)!.currentStock, countedQuantity: item.countedQuantity, variance: item.countedQuantity - map.get(item.productId)!.currentStock, reason: item.reason })));
      await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "STOCK_COUNT", entityId: stockCountId, details: input });
      return { id: stockCountId };
    });
  }),

  salesReturns: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "returns.manage");
    const db = await getDb();
    return db ? db.select().from(salesReturns).orderBy(desc(salesReturns.createdAt)).limit(100) : [];
  }),
  createSalesReturn: protectedProcedure.input(z.object({ saleId: positive, reason: z.string().min(5), items: z.array(z.object({ saleItemId: positive, quantity: positive })).min(1) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "returns.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.transaction(async (tx) => {
      const sale = await tx.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale[0] || sale[0].status !== "COMPLETED") throw new TRPCError({ code: "BAD_REQUEST", message: "Only completed sales can be returned" });
      const saleItemIds = input.items.map((item) => item.saleItemId);
      const itemRows = await tx.select().from(saleItems).where(and(eq(saleItems.saleId, input.saleId), inArray(saleItems.id, saleItemIds)));
      const itemMap = new Map(itemRows.map((item) => [item.id, item]));
      if (itemMap.size !== new Set(saleItemIds).size) throw new TRPCError({ code: "BAD_REQUEST", message: "Return items must reference the original sale" });
      let totalAmount = 0;
      const normalized = input.items.map((item) => {
        const original = itemMap.get(item.saleItemId)!;
        if (original.returnedQuantity + item.quantity > original.quantity) throw new TRPCError({ code: "BAD_REQUEST", message: "Return quantity exceeds the original unreturned quantity" });
        const lineTotal = item.quantity * original.unitPrice;
        totalAmount += lineTotal;
        return { ...item, productId: original.productId, unitPrice: original.unitPrice, lineTotal };
      });
      const result = await tx.insert(salesReturns).values({ returnNumber: ref("SRET"), saleId: input.saleId, customerId: sale[0].customerId, totalAmount, reason: input.reason, processedBy: ctx.user.id });
      const returnId = result[0].insertId;
      await tx.insert(salesReturnItems).values(normalized.map((item) => ({ salesReturnId: returnId, ...item })));
      for (const item of normalized) {
        const original = itemMap.get(item.saleItemId)!;
        await tx.update(saleItems).set({ returnedQuantity: original.returnedQuantity + item.quantity }).where(eq(saleItems.id, item.saleItemId));
        const product = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (!product[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
        await tx.update(products).set({ currentStock: product[0].currentStock + item.quantity }).where(eq(products.id, item.productId));
        await tx.insert(stockMovements).values({ productId: item.productId, movementType: "SALE_RETURN", quantity: item.quantity, referenceType: "SALES_RETURN", referenceId: returnId, reason: input.reason, performedBy: ctx.user.id });
      }
      if (sale[0].balance > 0) {
        const creditReduction = Math.min(sale[0].balance, totalAmount);
        await tx.update(sales).set({ balance: sale[0].balance - creditReduction }).where(eq(sales.id, input.saleId));
        const customer = await tx.select().from(customers).where(eq(customers.id, sale[0].customerId)).limit(1);
        if (customer[0]) await tx.update(customers).set({ outstandingBalance: Math.max(0, customer[0].outstandingBalance - creditReduction) }).where(eq(customers.id, sale[0].customerId));
      }
      await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "SALES_RETURN", entityId: returnId, details: input });
      return { id: returnId, totalAmount };
    });
  }),

  createPurchaseReturn: protectedProcedure.input(z.object({ purchaseId: positive, reason: z.string().min(5), items: z.array(z.object({ purchaseItemId: positive, quantity: positive })).min(1) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "returns.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.transaction(async (tx) => {
      const purchase = (await tx.select().from(purchases).where(eq(purchases.id, input.purchaseId)).limit(1))[0];
      if (!purchase || purchase.status !== "RECEIVED") throw new TRPCError({ code: "BAD_REQUEST", message: "Only received purchases can be returned" });
      const itemIds = input.items.map((item) => item.purchaseItemId);
      const originalRows = await tx.select().from(purchaseItems).where(and(eq(purchaseItems.purchaseId, input.purchaseId), inArray(purchaseItems.id, itemIds)));
      const originalMap = new Map(originalRows.map((item) => [item.id, item]));
      if (originalMap.size !== new Set(itemIds).size) throw new TRPCError({ code: "BAD_REQUEST", message: "Purchase return items must reference the original purchase" });
      let totalAmount = 0;
      const normalized = [] as Array<{ purchaseItemId: number; productId: number; quantity: number; unitCost: number; lineTotal: number }>;
      for (const item of input.items) {
        const original = originalMap.get(item.purchaseItemId)!;
        const priorReturns = await tx.select().from(purchaseReturnItems).where(eq(purchaseReturnItems.purchaseItemId, item.purchaseItemId));
        const returned = priorReturns.reduce((sum, row) => sum + row.quantity, 0);
        if (returned + item.quantity > original.quantity) throw new TRPCError({ code: "BAD_REQUEST", message: "Purchase return exceeds the original received quantity" });
        const lineTotal = item.quantity * original.unitCost;
        totalAmount += lineTotal;
        normalized.push({ purchaseItemId: item.purchaseItemId, productId: original.productId, quantity: item.quantity, unitCost: original.unitCost, lineTotal });
      }
      const result = await tx.insert(purchaseReturns).values({ returnNumber: ref("PRET"), purchaseId: input.purchaseId, supplierId: purchase.supplierId, totalAmount, reason: input.reason, processedBy: ctx.user.id });
      const returnId = result[0].insertId;
      await tx.insert(purchaseReturnItems).values(normalized.map((item) => ({ purchaseReturnId: returnId, ...item })));
      for (const item of normalized) {
        const product = (await tx.select().from(products).where(eq(products.id, item.productId)).limit(1))[0];
        if (!product || item.quantity > product.currentStock) throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient stock to return ${item.quantity} units` });
        await tx.update(products).set({ currentStock: product.currentStock - item.quantity }).where(eq(products.id, item.productId));
        await tx.insert(stockMovements).values({ productId: item.productId, movementType: "PURCHASE_RETURN", quantity: -item.quantity, referenceType: "PURCHASE_RETURN", referenceId: returnId, reason: input.reason, performedBy: ctx.user.id });
      }
      await writeAuditLog({ userId: ctx.user.id, action: "CREATE", entityType: "PURCHASE_RETURN", entityId: returnId, details: input });
      return { id: returnId, totalAmount };
    });
  }),

  approveStockCount: protectedProcedure.input(z.object({ stockCountId: positive })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx, "inventory.adjust.approve");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.transaction(async (tx) => {
      const stockCount = (await tx.select().from(stockCounts).where(eq(stockCounts.id, input.stockCountId)).limit(1))[0];
      if (!stockCount || stockCount.status !== "OPEN") throw new TRPCError({ code: "BAD_REQUEST", message: "Open stock count not found" });
      const countItems = await tx.select().from(stockCountItems).where(eq(stockCountItems.stockCountId, input.stockCountId));
      for (const item of countItems) {
        if (item.variance === 0) continue;
        const product = (await tx.select().from(products).where(eq(products.id, item.productId)).limit(1))[0];
        if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Stock count product not found" });
        await tx.update(products).set({ currentStock: item.countedQuantity }).where(eq(products.id, item.productId));
        await tx.insert(stockMovements).values({ productId: item.productId, movementType: item.variance > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", quantity: item.variance, referenceType: "STOCK_COUNT", referenceId: input.stockCountId, reason: item.reason ?? "Approved physical stock count variance", performedBy: ctx.user.id });
      }
      await tx.update(stockCounts).set({ status: "APPROVED", approvedBy: ctx.user.id, approvedAt: new Date() }).where(eq(stockCounts.id, input.stockCountId));
      await writeAuditLog({ userId: ctx.user.id, action: "APPROVE", entityType: "STOCK_COUNT", entityId: input.stockCountId });
      return { success: true };
    });
  }),

  movements: protectedProcedure.input(z.object({ productId: positive.optional() }).optional()).query(async ({ ctx, input }) => {
    await requirePermission(ctx, "inventory.view");
    const db = await getDb();
    return db ? db.select().from(stockMovements).where(input?.productId ? eq(stockMovements.productId, input.productId) : undefined).orderBy(desc(stockMovements.createdAt)).limit(200) : [];
  }),
  payments: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx, "payments.manage");
    const db = await getDb();
    return db ? db.select().from(payments).orderBy(desc(payments.createdAt)).limit(100) : [];
  }),
});
