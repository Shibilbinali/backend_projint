-- ============================================================
-- BOOKSTORE POS - DATABASE SCHEMA MIGRATION
-- Add front and back cover URLs to books table
-- ============================================================

ALTER TABLE books ADD COLUMN front_cover_url TEXT;
ALTER TABLE books ADD COLUMN back_cover_url TEXT;
