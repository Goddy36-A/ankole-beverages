# Project TODO

## Foundation

- [x] Define the business domain schema for users, roles, permissions, products, suppliers, customers, purchases, sales, payments, stock, returns, reports, and audit logs.
- [x] Keep authoritative stock quantities and immutable stock movement history consistent in transactional server procedures.
- [x] Add the requested blueprint visual language with royal blue background, technical grid, white linework, and strong sans-serif hierarchy.

## Access control and audit

- [x] Implement configurable roles: Admin, Manager, Sales Officer, and Storekeeper.
- [x] Implement granular server-side permission checks for every protected action.
- [x] Record important authentication, inventory, purchase, sale, return, payment, approval, and configuration events in the audit log.

## Master data

- [x] Implement product management with SKU, category, unit, packaging, prices, reorder level, active state, and expiry tracking.
- [x] Implement category, unit, packaging, supplier, and customer management.
- [x] Support configurable payment methods beyond cash, mobile money, and bank.

## Purchasing and inventory

- [x] Implement purchase order creation and receiving workflow.
- [x] Create stock-in movements and update available stock when receipts are confirmed.
- [x] Implement stock movements, low-stock and out-of-stock alerts, damage/expiry/loss recording, and controlled adjustments.
- [x] Require an adjustment reason and manager approval before a stock adjustment affects stock.
- [x] Implement physical stock counts and variance recording.

## Sales, credit, payments, and returns

- [x] Implement multi-item sales with server-side totals, price validation, active-product validation, and stock validation.
- [x] Implement configurable payment methods and payment recording.
- [x] Enforce credit limits at point of sale and show outstanding balances, statements, and overdue balances.
- [x] Implement traceable sales returns and purchase returns linked to original transactions.
- [x] Generate invoice and receipt views from confirmed transactions.

## Reports and exports

- [x] Implement dashboard KPIs for sales, revenue, stock, valuation, balances, alerts, and recent activity.
- [x] Implement sales, inventory, purchase, customer, and management reports with date and entity filters.
- [x] Apply role-based visibility to reports and exports.
- [x] Add CSV and Excel export support.

## Verification and delivery

- [x] Add Vitest coverage for permission enforcement, server-side sales calculations, stock rules, credit limits, approval rules, and traceable returns.
- [x] Run type checks, tests, and production build verification.
- [x] Review responsive layouts and key user flows in the live preview.
- [x] Update this checklist before saving the final project checkpoint.

## Change history

- [x] Initial implementation scope captured from the supplied requirements.
- [x] No additional user-requested changes were received after the final implementation scope; future changes will continue to be appended here.

## Out of scope for this first implementation

- [x] Explicitly deferred external payment gateway integration; the system supports configurable payment methods and recorded payments in the current scope.
- [x] Explicitly deferred multi-branch stock transfers; the current scope is a single operating location with extension points in the data model.
- [x] Explicitly deferred automated email/SMS delivery; reports and statements are available for on-screen review and export in the current scope.
- [x] Explicitly deferred marketplace/e-commerce checkout because this is an internal operational management system.

## Assumptions

- [x] The initial deployment uses the existing managed web application stack and its built-in authentication/database facilities.
- [x] Business currency defaults to UGX and is configurable in system settings.
- [x] All critical calculations and authorization decisions are performed on the server.
- [x] The system uses the existing authenticated owner/admin identity as the first administrator account.
- [x] No fabricated customer reviews, ratings, or testimonials are used.

## Release-gap follow-up

- [x] Add authentication lifecycle audit events for login/bootstrap/logout.
- [x] Finish product active/inactive, edit, and expiry-tracking controls in the UI.
- [x] Finish master-data create/update/activation surfaces for categories, units, packaging, suppliers, and customers.
- [x] Add explicit damage, expiry, and loss stock workflows plus dedicated alert handling.
- [x] Add overdue-balance reporting and visible customer statement controls.
- [x] Add invoice and receipt detail views for confirmed transactions.
- [x] Add date/entity filters to sales, inventory, purchase, customer, and management reports.
- [x] Add router-level permission coverage and pure business-rule tests for approvals and traceable returns.
- [x] Make the configured currency setting drive money formatting instead of using only a hardcoded UI helper.
- [x] Document authenticated-flow verification status: the preview reaches the existing sign-in gate; deeper authenticated interactions require the user's session and were not claimed as sandbox-verified.
- [x] Save the final project checkpoint after the gap items are verified.

## Final release-gap follow-up

- [x] Add a distinct bootstrap/login lifecycle audit record and cover authenticated lifecycle logging with a test.
- [x] Add visible customer activation/deactivation and general profile editing controls.
- [x] Expose purchase and management report views with filter controls in the UI.
- [x] Save and verify the final checkpoint after these final controls are complete.

## GitHub export

- [ ] Create the private GitHub repository `ankole-beverages` under the authenticated account and push the current project.
