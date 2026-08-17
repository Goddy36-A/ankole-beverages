CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` int,
	`details` text,
	`ipAddress` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerNumber` varchar(40) NOT NULL,
	`name` varchar(180) NOT NULL,
	`customerType` varchar(80) NOT NULL DEFAULT 'Walk-in',
	`telephone` varchar(40),
	`email` varchar(320),
	`address` text,
	`creditLimit` int NOT NULL DEFAULT 0,
	`outstandingBalance` int NOT NULL DEFAULT 0,
	`paymentTerms` varchar(120),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_customerNumber_unique` UNIQUE(`customerNumber`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`title` varchar(160) NOT NULL,
	`message` text NOT NULL,
	`type` varchar(40) NOT NULL DEFAULT 'INFO',
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `packagings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `packagings_id` PRIMARY KEY(`id`),
	CONSTRAINT `packagings_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `paymentMethods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymentMethods_id` PRIMARY KEY(`id`),
	CONSTRAINT `paymentMethods_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptNumber` varchar(40) NOT NULL,
	`saleId` int NOT NULL,
	`customerId` int NOT NULL,
	`paymentMethodId` int NOT NULL,
	`amount` int NOT NULL,
	`referenceNumber` varchar(120),
	`notes` text,
	`receivedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_receiptNumber_unique` UNIQUE(`receiptNumber`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(64) NOT NULL,
	`name` varchar(180) NOT NULL,
	`categoryId` int NOT NULL,
	`unitId` int NOT NULL,
	`packagingId` int,
	`brand` varchar(100),
	`size` varchar(50),
	`description` text,
	`costPrice` int NOT NULL DEFAULT 0,
	`sellingPrice` int NOT NULL DEFAULT 0,
	`reorderLevel` int NOT NULL DEFAULT 0,
	`currentStock` int NOT NULL DEFAULT 0,
	`expiryTracking` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `purchaseItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseId` int NOT NULL,
	`productId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitCost` int NOT NULL,
	`lineTotal` int NOT NULL,
	`expiryDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchaseItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchaseReturnItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseReturnId` int NOT NULL,
	`purchaseItemId` int NOT NULL,
	`productId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitCost` int NOT NULL,
	`lineTotal` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchaseReturnItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchaseReturns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`returnNumber` varchar(40) NOT NULL,
	`purchaseId` int NOT NULL,
	`supplierId` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'APPROVED',
	`totalAmount` int NOT NULL DEFAULT 0,
	`reason` text NOT NULL,
	`processedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchaseReturns_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchaseReturns_returnNumber_unique` UNIQUE(`returnNumber`)
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseNumber` varchar(40) NOT NULL,
	`supplierId` int NOT NULL,
	`invoiceNumber` varchar(80),
	`status` varchar(30) NOT NULL DEFAULT 'DRAFT',
	`totalAmount` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdBy` int NOT NULL,
	`receivedBy` int,
	`receivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchases_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchases_purchaseNumber_unique` UNIQUE(`purchaseNumber`)
);
--> statement-breakpoint
CREATE TABLE `rolePermissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roleId` int NOT NULL,
	`permissionId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rolePermissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `rolePermissionUnique` UNIQUE(`roleId`,`permissionId`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `saleItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`saleId` int NOT NULL,
	`productId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` int NOT NULL,
	`unitCost` int NOT NULL,
	`lineTotal` int NOT NULL,
	`returnedQuantity` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saleItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceNumber` varchar(40) NOT NULL,
	`customerId` int NOT NULL,
	`status` varchar(30) NOT NULL DEFAULT 'COMPLETED',
	`saleType` varchar(20) NOT NULL DEFAULT 'CASH',
	`subtotal` int NOT NULL DEFAULT 0,
	`discount` int NOT NULL DEFAULT 0,
	`tax` int NOT NULL DEFAULT 0,
	`totalAmount` int NOT NULL DEFAULT 0,
	`amountPaid` int NOT NULL DEFAULT 0,
	`balance` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_id` PRIMARY KEY(`id`),
	CONSTRAINT `sales_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `salesReturnItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`salesReturnId` int NOT NULL,
	`saleItemId` int NOT NULL,
	`productId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` int NOT NULL,
	`lineTotal` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salesReturnItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `salesReturns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`returnNumber` varchar(40) NOT NULL,
	`saleId` int NOT NULL,
	`customerId` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'APPROVED',
	`totalAmount` int NOT NULL DEFAULT 0,
	`reason` text NOT NULL,
	`processedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salesReturns_id` PRIMARY KEY(`id`),
	CONSTRAINT `salesReturns_returnNumber_unique` UNIQUE(`returnNumber`)
);
--> statement-breakpoint
CREATE TABLE `stockAdjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adjustmentNumber` varchar(40) NOT NULL,
	`productId` int NOT NULL,
	`adjustmentType` varchar(20) NOT NULL,
	`quantity` int NOT NULL,
	`reason` text NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'PENDING',
	`requestedBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stockAdjustments_id` PRIMARY KEY(`id`),
	CONSTRAINT `stockAdjustments_adjustmentNumber_unique` UNIQUE(`adjustmentNumber`)
);
--> statement-breakpoint
CREATE TABLE `stockCountItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stockCountId` int NOT NULL,
	`productId` int NOT NULL,
	`systemQuantity` int NOT NULL,
	`countedQuantity` int NOT NULL,
	`variance` int NOT NULL,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stockCountItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stockCounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`countNumber` varchar(40) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'OPEN',
	`countedBy` int NOT NULL,
	`approvedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`approvedAt` timestamp,
	CONSTRAINT `stockCounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `stockCounts_countNumber_unique` UNIQUE(`countNumber`)
);
--> statement-breakpoint
CREATE TABLE `stockMovements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`movementType` varchar(30) NOT NULL,
	`quantity` int NOT NULL,
	`referenceType` varchar(40),
	`referenceId` int,
	`reason` text,
	`performedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stockMovements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierNumber` varchar(40) NOT NULL,
	`name` varchar(180) NOT NULL,
	`contactPerson` varchar(140),
	`telephone` varchar(40),
	`email` varchar(320),
	`address` text,
	`location` varchar(140),
	`taxNumber` varchar(80),
	`paymentTerms` varchar(120),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `suppliers_supplierNumber_unique` UNIQUE(`supplierNumber`)
);
--> statement-breakpoint
CREATE TABLE `systemSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(100) NOT NULL,
	`settingValue` text NOT NULL,
	`description` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `systemSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `systemSettings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `units_id` PRIMARY KEY(`id`),
	CONSTRAINT `units_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `userRoles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`roleId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userRoles_id` PRIMARY KEY(`id`),
	CONSTRAINT `userRoleUnique` UNIQUE(`userId`,`roleId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` varchar(32) NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;