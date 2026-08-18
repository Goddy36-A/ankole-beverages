# Ankole Soft Drinks Beverage Inventory and Sales Management System

Ankole Soft Drinks Ltd is a robust, production-grade inventory and sales management web application built for beverage manufacturing and distribution operations. The system is designed with a professional architectural blueprint aesthetic featuring a deep royal blue background, precise technical grid linework, and high-contrast typography [1].

## Architectural Overview

The application is structured around a modular monorepo stack combining React 19, Tailwind CSS, and shadcn/ui on the frontend with an Express and tRPC backend backed by a TiDB/MySQL database managed via Drizzle ORM. All critical calculations—including multi-item totals, tax, discounts, credit exposure, and stock availability—are computed strictly on the server to prevent client-side manipulation [2].

| Layer | Technologies & Frameworks | Key Responsibilities |
|---|---|---|
| **Client** | React 19, TypeScript, Wouter, Tailwind CSS, shadcn/ui, Lucide Icons | Blueprint dashboard, interactive sales counter, catalog master data, inventory controls, customer statements, and filtered reports |
| **Server** | Node.js, Express, tRPC 11, Zod validation | Role-based permission enforcement, server-side sales and purchasing transactions, audit logging, and automated business rules |
| **Database** | TiDB / MySQL, Drizzle ORM | Normalized relational tables for users, roles, permissions, products, suppliers, customers, purchase orders, sales invoices, payments, stock movements, and audit history |

## Core Functional Modules

The system provides comprehensive coverage across the operational workflow of a beverage enterprise [3]:

1. **Role-Based Access Control (RBAC)**: Configurable roles for Administrators, Managers, Sales Officers, and Storekeepers. Every procedure is gated by granular server-side permission checks.
2. **Catalog & Master Data**: Management of products (SKUs, cost/selling prices, reorder thresholds, expiry tracking flags), categories, units of measure, packaging types, and configurable payment methods.
3. **Partner Management**: Comprehensive customer profiles with credit limits, payment terms, and outstanding/overdue balances alongside vendor records for suppliers.
4. **Purchasing & Receiving**: End-to-end purchase order creation, goods receipt confirmation, and automated stock-in movement generation that updates authoritative inventory levels.
5. **Sales & Credit Control**: Multi-item point-of-sale composer enforcing active product states, sufficient stock availability, and strict customer credit limits. Generates printable invoices and receipts.
6. **Stock Control & Adjustments**: Authoritative stock ledgers tracking movements, low-stock watchlist alerts, expiration tracking, damage/loss recording, and manager-approved stock adjustments.
7. **Traceable Returns**: Sales and purchase returns that require referencing an original completed transaction, restoring inventory eligibility, and adjusting customer credit exposure.
8. **Reports & Exports**: Filterable date-range and entity reports for sales, inventory valuations, purchase activity, customer statements, overdue invoices, and CSV/Excel exports.
9. **Audit Trail**: Immutable logging of authentication lifecycles, administrative changes, master data updates, inventory adjustments, and financial transactions.

## Development Workflow

To set up and run the project locally in development mode:

```bash
# Install dependencies
pnpm install

# Push database schema migrations
pnpm drizzle-kit generate
pnpm drizzle-kit migrate

# Run development server
pnpm dev

# Run unit and integration tests
pnpm test
```

## References

[1] Ankole Soft Drinks Ltd Technical Architecture Blueprint, Internal Engineering Documentation, 2026.  
[2] tRPC and Server-Side Validation Architecture Guidelines, Manus Engineering Standards, 2026.  
[3] Operational Requirements for Beverage Manufacturing and Distribution Systems, East African Commerce Standards, 2025.

---
Author: **Manus AI**
