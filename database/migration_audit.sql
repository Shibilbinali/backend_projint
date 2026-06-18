-- ============================================================
-- BOOKSTORE POS - DATABASE SCHEMA AUDIT & PRICING MIGRATION
-- ============================================================

-- 1. Add page_count column (default 0)
ALTER TABLE books ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 0;

-- 2. Add format column (default 'Printed')
ALTER TABLE books ADD COLUMN IF NOT EXISTS format VARCHAR(50) DEFAULT 'Printed' CHECK (format IN ('Printed', 'Digital'));
