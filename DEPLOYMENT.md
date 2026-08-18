# Deployment Guide — Ankole Beverage Management System

This guide outlines the production deployment architecture, environment configuration, database migration procedures, and hosting options for the Ankole Soft Drinks Inventory and Sales Management System.

## Production Architecture

The system is engineered as a fullstack TypeScript web application that compiles into a static single-page application (SPA) frontend served alongside a robust Express and tRPC backend. 

| Component | Target Runtime | Configuration Requirements |
|---|---|---|
| **Frontend** | Static asset bundle (`dist/public`) | Served via Express static middleware with client-side Wouter routing |
| **Backend** | Node.js 22+ ES module runtime (`dist/index.js`) | Stateless server process handling tRPC API procedures and authentication cookies |
| **Database** | TiDB / MySQL 8.0+ relational database | Accessible via `DATABASE_URL` connection string with SSL enabled |

## Environment Variables

The application relies on secure environment variables injected at runtime [1]:

| Variable Name | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | MySQL/TiDB connection URI with credentials and port | Yes |
| `JWT_SECRET` | Secret key used to sign and verify authentication session cookies | Yes |
| `VITE_APP_ID` | OAuth application identifier for Manus identity integration | Yes |
| `OAUTH_SERVER_URL` | OAuth gateway base URL | Yes |
| `VITE_OAUTH_PORTAL_URL` | Login portal frontend URL | Yes |
| `OWNER_OPEN_ID` | OpenID of the designated system owner/administrator | Yes |

## Hosting Strategies

1. **Autoscale (Serverless / Cloud Run)**: The default mode for Ankole Soft Drinks deployments on Manus. Instances automatically scale up during operational hours and spin down to zero during inactivity. Ideal for cost efficiency and zero maintenance [2].
2. **Reserved / Always-On Hosting**: Recommended if the enterprise requires continuous background processing, dedicated compute resources, or fixed-IP integrations [3]. Upgradable through the hosting management interface.

## Step-by-Step Deployment Procedure

1. **Verify Environment Secrets**: Ensure `DATABASE_URL`, `JWT_SECRET`, and OAuth identifiers are configured in the project deployment settings or secrets manager.
2. **Run Build Verification**:
   ```bash
   pnpm install
   pnpm build
   pnpm test
   ```
3. **Apply Database Migrations**: Execute any pending schema changes against the production database:
   ```bash
   pnpm drizzle-kit migrate
   ```
4. **Publish Checkpoint**: Save a deployment checkpoint using the project management tooling or commit and push the repository to trigger automated publishing.

## References

[1] Production Environment Security Guidelines, Manus Cloud Architecture, 2026.  
[2] Autoscale Runtime Constraints and Cold Start Best Practices, Serverless Hosting Standards, 2025.  
[3] Persistent Computing and Reserved Hosting Specifications, Ankole IT Manual, 2026.

---
Author: **Manus AI**
