-- ============================================================
-- BOOKSTORE POS - CATALOG EXPANSION SCHEMA MIGRATION
-- ============================================================

-- 1. Add library columns to books table
ALTER TABLE books ADD COLUMN IF NOT EXISTS reading_age VARCHAR(50) DEFAULT 'All Ages';
ALTER TABLE books ADD COLUMN IF NOT EXISTS price_type VARCHAR(20) DEFAULT 'Premium' CHECK (price_type IN ('Free', 'Premium'));
ALTER TABLE books ADD COLUMN IF NOT EXISTS tags VARCHAR(500);

-- 2. Clear old transactions to prevent FK conflicts during re-seeding
DELETE FROM sale_items;
DELETE FROM sales;
DELETE FROM book_secondary_categories;
DELETE FROM books;
DELETE FROM categories;

-- 3. Seed the 9 expanded categories
INSERT INTO categories (id, name, description, color) VALUES
(1, 'Manga', 'Graphic novels, comics, and manga series.', '#6A1B9A'),
(2, 'Children''s Story Books', 'Storybooks and bedtime tales for kids.', '#F57F17'),
(3, 'Children''s Picture Books', 'Highly illustrated picture books for young children.', '#FFB300'),
(4, 'Children''s Fiction', 'Novels and fantasy stories for growing readers.', '#D81B60'),
(5, 'History', 'Historical overviews, accounts, and educational resources.', '#4E342E'),
(6, 'Science & Technology', 'Cosmology, physics, robotics, and coding books.', '#00695C'),
(7, 'Geography & Travel', 'World atlases, geography, and travel guides.', '#00838F'),
(8, 'Animals & Nature', 'Wildlife exploration and animal story collections.', '#2E7D32'),
(9, 'Classics', 'Timeless literary masterpieces and adventure novels.', '#1565C0');

-- 4. Reset sequence
SELECT setval('categories_id_seq', 9);
