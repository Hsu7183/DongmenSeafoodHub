CREATE TABLE `portal_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`product_name` text NOT NULL,
	`specification` text NOT NULL,
	`unit` text NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `portal_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `portal_products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "portal_quantity_valid" CHECK("portal_order_items"."quantity" > 0 AND "portal_order_items"."quantity" <= 9999)
);
--> statement-breakpoint
CREATE INDEX `idx_portal_items_order` ON `portal_order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `portal_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`owner_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`order_day` text NOT NULL,
	`stall` text NOT NULL,
	`notes` text NOT NULL,
	`demo` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_orders_number_unique` ON `portal_orders` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_portal_orders_owner_key` ON `portal_orders` (`owner_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_portal_orders_demo_day` ON `portal_orders` (`demo`,`order_day`);--> statement-breakpoint
CREATE TABLE `portal_products` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`specification` text NOT NULL,
	`unit` text NOT NULL,
	`category` text NOT NULL,
	`temperature` text NOT NULL,
	`supplier` text NOT NULL,
	`source_url` text,
	`source_type` text NOT NULL,
	`source_updated_at` text NOT NULL,
	`authorization_status` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`demo` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_products_sku_unique` ON `portal_products` (`sku`);