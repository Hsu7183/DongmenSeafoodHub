CREATE TABLE `purchase_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_item_id` text NOT NULL,
	`order_id` text NOT NULL,
	`order_item_id` text NOT NULL,
	`requested_quantity` integer NOT NULL,
	`allocated_quantity` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`batch_item_id`) REFERENCES `purchase_batch_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `portal_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_item_id`) REFERENCES `portal_order_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_allocations_order_item` ON `purchase_allocations` (`order_item_id`);--> statement-breakpoint
CREATE INDEX `idx_allocations_batch_item` ON `purchase_allocations` (`batch_item_id`);--> statement-breakpoint
CREATE TABLE `portal_atomic_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	CONSTRAINT "portal_atomic_guard_ok" CHECK("portal_atomic_guards"."ok"=1)
);
--> statement-breakpoint
CREATE TABLE `purchase_batch_events` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`revision` integer NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `purchase_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_batch_event_revision` ON `purchase_batch_events` (`batch_id`,`revision`);--> statement-breakpoint
CREATE TABLE `portal_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`stall_name` text NOT NULL,
	`pin_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`auth_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_customers_stall_name_unique` ON `portal_customers` (`stall_name`);--> statement-breakpoint
CREATE TABLE `portal_login_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase_batch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`product_name` text NOT NULL,
	`specification` text NOT NULL,
	`unit` text NOT NULL,
	`requested_quantity` integer NOT NULL,
	`supplier_confirmed_quantity` integer,
	FOREIGN KEY (`batch_id`) REFERENCES `purchase_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text DEFAULT 'PURCHASING' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`demo` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_batches_number_unique` ON `purchase_batches` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_batches_idempotency_key_unique` ON `purchase_batches` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `portal_order_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `portal_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_portal_revisions_order_version` ON `portal_order_revisions` (`order_id`,`revision`);--> statement-breakpoint
CREATE TABLE `portal_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`role` text NOT NULL,
	`auth_version` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `portal_customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_portal_sessions_expiry` ON `portal_sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `portal_order_items` ADD `current_quantity` integer;--> statement-breakpoint
ALTER TABLE `portal_orders` ADD `customer_id` text REFERENCES portal_customers(id);--> statement-breakpoint
ALTER TABLE `portal_orders` ADD `status` text DEFAULT 'SUBMITTED' NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_orders` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_orders` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `portal_orders` ADD `fulfillment_confirmation` text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_orders` ADD `allocation_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_portal_orders_customer` ON `portal_orders` (`customer_id`,`created_at`);