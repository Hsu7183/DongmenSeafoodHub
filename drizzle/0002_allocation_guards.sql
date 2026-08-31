-- Custom SQL migration file, put your code below! --
CREATE TRIGGER IF NOT EXISTS portal_allocation_update_limit BEFORE UPDATE OF allocated_quantity ON purchase_allocations
BEGIN
 SELECT CASE WHEN NEW.allocated_quantity < 0 OR NEW.allocated_quantity > NEW.requested_quantity OR typeof(NEW.allocated_quantity)<>'integer'
 OR NEW.allocated_quantity + COALESCE((SELECT SUM(allocated_quantity) FROM purchase_allocations WHERE batch_item_id=NEW.batch_item_id AND id<>NEW.id),0) > COALESCE((SELECT supplier_confirmed_quantity FROM purchase_batch_items WHERE id=NEW.batch_item_id),0)
 THEN RAISE(ABORT,'allocation_limit') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS portal_allocation_insert_limit BEFORE INSERT ON purchase_allocations
BEGIN
 SELECT CASE WHEN NEW.allocated_quantity < 0 OR NEW.allocated_quantity > NEW.requested_quantity OR typeof(NEW.allocated_quantity)<>'integer'
 OR NEW.allocated_quantity + COALESCE((SELECT SUM(allocated_quantity) FROM purchase_allocations WHERE batch_item_id=NEW.batch_item_id),0) > COALESCE((SELECT supplier_confirmed_quantity FROM purchase_batch_items WHERE id=NEW.batch_item_id),0)
 THEN RAISE(ABORT,'allocation_limit') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS portal_supply_limit BEFORE UPDATE OF supplier_confirmed_quantity ON purchase_batch_items
BEGIN
 SELECT CASE WHEN NEW.supplier_confirmed_quantity IS NULL OR typeof(NEW.supplier_confirmed_quantity)<>'integer' OR NEW.supplier_confirmed_quantity<0 OR NEW.supplier_confirmed_quantity>NEW.requested_quantity
 OR NEW.supplier_confirmed_quantity < COALESCE((SELECT SUM(allocated_quantity) FROM purchase_allocations WHERE batch_item_id=NEW.id),0)
 THEN RAISE(ABORT,'allocation_limit') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS portal_effective_quantity_limit BEFORE UPDATE OF current_quantity ON portal_order_items
BEGIN
 SELECT CASE WHEN NEW.current_quantity IS NOT NULL AND (typeof(NEW.current_quantity)<>'integer' OR NEW.current_quantity<0 OR NEW.current_quantity>9999) THEN RAISE(ABORT,'invalid_current_quantity') END;
END;
