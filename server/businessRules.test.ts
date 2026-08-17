import { describe, expect, it } from "vitest";
import {
  calculateSaleTotals,
  validateAdjustment,
  validateCreditExposure,
  validateReturnQuantity,
  validateSaleLine,
} from "./businessRules";

describe("inventory and sales business rules", () => {
  const product = { name: "Blueprint Cola", isActive: true, currentStock: 20, costPrice: 1200, sellingPrice: 1800 };

  it("rejects inactive products and quantities above available stock", () => {
    expect(() => validateSaleLine({ ...product, isActive: false }, { quantity: 1 })).toThrow(/inactive/);
    expect(() => validateSaleLine(product, { quantity: 21 })).toThrow(/Insufficient stock/);
  });

  it("rejects a sale price below cost and calculates a valid line", () => {
    expect(() => validateSaleLine(product, { quantity: 2, unitPrice: 1000 })).toThrow(/below cost/);
    expect(validateSaleLine(product, { quantity: 2 })).toEqual({ unitPrice: 1800, lineTotal: 3600 });
  });

  it("calculates totals on the server-side rule helper", () => {
    expect(calculateSaleTotals([{ quantity: 2, unitPrice: 1800 }, { quantity: 1, unitPrice: 2500 }], 500, 300)).toEqual({ subtotal: 6100, totalAmount: 5900 });
    expect(() => calculateSaleTotals([{ quantity: 1, unitPrice: 100 }], 101, 0)).toThrow(/Discount cannot exceed/);
  });

  it("enforces credit exposure unless an override is explicitly authorized", () => {
    expect(() => validateCreditExposure(8000, 4000, 10000, false)).toThrow(/credit limit/);
    expect(validateCreditExposure(8000, 4000, 10000, true)).toBe(true);
  });

  it("requires a reason and prevents negative stock adjustments", () => {
    expect(() => validateAdjustment("OUT", 3, "", 10)).toThrow(/reason/);
    expect(() => validateAdjustment("OUT", 11, "damage", 10)).toThrow(/negative stock/);
    expect(validateAdjustment("IN", 5, "opening balance correction", 10)).toBe(15);
  });

  it("keeps returns traceable to the original unreturned quantity", () => {
    expect(validateReturnQuantity(10, 4, 6)).toBe(true);
    expect(() => validateReturnQuantity(10, 4, 7)).toThrow(/original unreturned quantity/);
  });
});
