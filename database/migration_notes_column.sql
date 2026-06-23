-- ============================================================
-- MIGRATION: Add notes column to customers table
-- Date: 2026-06-20
-- Description: Adds optional 'notes' TEXT column to customers table
--              to support internal notes/preferences per customer.
-- ============================================================

-- Add notes column if it does not already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'customers' AND column_name = 'notes'
    ) THEN
        ALTER TABLE customers ADD COLUMN notes TEXT;
        RAISE NOTICE 'Column notes added to customers table.';
    ELSE
        RAISE NOTICE 'Column notes already exists in customers table. Skipping.';
    END IF;
END $$;
