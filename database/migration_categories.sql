-- ============================================================
-- BOOKSTORE POS - CATEGORY VERIFICATION SCHEMA MIGRATION
-- ============================================================

-- 1. Add review and confidence columns to books table
ALTER TABLE books ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN DEFAULT FALSE;
ALTER TABLE books ADD COLUMN IF NOT EXISTS categorization_confidence DECIMAL(3, 2) DEFAULT 1.00;
ALTER TABLE books ADD COLUMN IF NOT EXISTS categorization_notes TEXT;

-- 2. Create join table for secondary categories
CREATE TABLE IF NOT EXISTS book_secondary_categories (
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, category_id)
);

-- 3. Upsert standard 7 categories
INSERT INTO categories (name, description, color) VALUES
('Fiction', 'Novels, stories, literature, romance, mystery, fantasy, etc.', '#8B4513'),
('Non-Fiction', 'Biographies, history, self-help, education, business, etc.', '#2E7D32'),
('Science & Technology', 'Science, engineering, computing, mathematics, technology, and research-related books only.', '#00695C'),
('Educational', 'Textbooks, study guides, learning materials, and academic resources.', '#1565C0'),
('Children''s Picture Books', 'Books primarily containing illustrations for young children.', '#F57F17'),
('Early Readers', 'Books designed for children learning to read.', '#E8934A'),
('Parenting & Family', 'Pregnancy, child development, parenting guides, memory books, baby albums, and family-related books.', '#BF360C')
ON CONFLICT (name) DO UPDATE SET 
  description = EXCLUDED.description,
  color = EXCLUDED.color;

-- 4. Remap books currently assigned to deprecated categories
UPDATE books 
SET category_id = (SELECT id FROM categories WHERE name = 'Educational')
WHERE category_id = (SELECT id FROM categories WHERE name = 'Academic');

UPDATE books 
SET category_id = (SELECT id FROM categories WHERE name = 'Children''s Picture Books')
WHERE category_id = (SELECT id FROM categories WHERE name = 'Children''s Books');

UPDATE books 
SET category_id = (SELECT id FROM categories WHERE name = 'Fiction')
WHERE category_id = (SELECT id FROM categories WHERE name = 'Comics & Manga');

UPDATE books 
SET category_id = (SELECT id FROM categories WHERE name = 'Non-Fiction')
WHERE category_id = (SELECT id FROM categories WHERE name = 'Self-Help');

UPDATE books 
SET category_id = (SELECT id FROM categories WHERE name = 'Non-Fiction')
WHERE category_id = (SELECT id FROM categories WHERE name = 'History');

-- 5. Delete deprecated categories
DELETE FROM categories 
WHERE name IN ('Academic', 'Children''s Books', 'Comics & Manga', 'Self-Help', 'History');
