import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { writeAuditLog } from "./db";

const permissionMock = vi.hoisted(() => ({ allowed: false }));
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(null),
    userHasPermission: vi.fn().mockImplementation(async () => permissionMock.allowed),
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    ensureSystemBootstrap: vi.fn().mockResolvedValue(undefined),
  };
});

function createContext(): TrpcContext {
  return {
    user: {
      id: 99,
      openId: "router-test-user",
      name: "Router Test User",
      email: "router-test@example.com",
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("protected business routers", () => {
  beforeEach(() => {
    permissionMock.allowed = false;
  });

  it("rejects catalog reads when the caller lacks catalog.view", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.catalog.products({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects stock-adjustment requests when the caller lacks inventory.adjust", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.operations.requestAdjustment({ productId: 1, adjustmentType: "OUT", quantity: 1, reason: "test adjustment" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("audits authenticated session lifecycle events", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.auth.me();
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "AUTHENTICATED", entityType: "AUTH" }));
  });
});
