-- Trigger installation is performed by portal/constraints.sql during Worker initialization.
-- Keep this migration position; the hosted importer cannot split trigger bodies safely.
SELECT 1;
