export type SaleProductSnapshot = {
  name: string;
  isActive: boolean;
  currentStock: number;
  costPrice: number;
  sellingPrice: number;
};

export type SaleLineInput = {
  quantity: number;
  unitPrice?: number;
};

export function validateSaleLine(product: SaleProductSnapshot, line: SaleLineInput) {
  if (!product.isActive) throw new Error(`${product.name} is inactive and cannot be sold`);
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("Sale quantity must be a positive whole number");
  const unitPrice = line.unitPrice ?? product.sellingPrice;
  if (!Number.isInteger(unitPrice) || unitPrice < 0) throw new Error("Sale price must be a non-negative whole number");
  if (unitPrice < product.costPrice) throw new Error(`Sale price for ${product.name} cannot be below cost price`);
  if (line.quantity > product.currentStock) throw new Error(`Insufficient stock for ${product.name}. Available: ${product.currentStock}`);
  return { unitPrice, lineTotal: line.quantity * unitPrice };
}

export function calculateSaleTotals(lines: Array<{ quantity: number; unitPrice: number }>, discount: number, tax: number) {
  if (!Number.isInteger(discount) || discount < 0) throw new Error("Discount must be non-negative");
  if (!Number.isInteger(tax) || tax < 0) throw new Error("Tax must be non-negative");
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const totalAmount = subtotal - discount + tax;
  if (totalAmount < 0) throw new Error("Discount cannot exceed the sale subtotal plus tax");
  return { subtotal, totalAmount };
}

export function validateCreditExposure(existingBalance: number, newBalance: number, creditLimit: number, managerOverride: boolean) {
  if (existingBalance < 0 || newBalance < 0 || creditLimit < 0) throw new Error("Credit values cannot be negative");
  if (existingBalance + newBalance > creditLimit && !managerOverride) throw new Error("Customer credit limit would be exceeded");
  return true;
}

export function validateAdjustment(adjustmentType: "IN" | "OUT", quantity: number, reason: string, currentStock: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Adjustment quantity must be a positive whole number");
  if (!reason.trim()) throw new Error("An adjustment reason is required");
  if (adjustmentType === "OUT" && quantity > currentStock) throw new Error("Adjustment would create negative stock");
  return currentStock + (adjustmentType === "IN" ? quantity : -quantity);
}

export function validateReturnQuantity(originalQuantity: number, alreadyReturned: number, requestedQuantity: number) {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) throw new Error("Return quantity must be positive");
  if (alreadyReturned + requestedQuantity > originalQuantity) throw new Error("Return quantity exceeds the original unreturned quantity");
  return true;
}
