-- ============================================================
-- BOOKSTORE POS - COVER METADATA SCHEMA EXPANSION
-- Add cover_source and edition columns to books table
-- ============================================================

ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_source VARCHAR(100);
ALTER TABLE books ADD COLUMN IF NOT EXISTS edition VARCHAR(100);
