-- ============================================================
-- BOOKSTORE POS - SEED DATA
-- Run schema.sql FIRST, then this file
-- ============================================================

-- ============================================================
-- USERS (passwords are bcrypt of 'password123')
-- ============================================================
INSERT INTO users (username, email, password_hash, role) VALUES
('admin', 'shibilkm2005@gmail.com', '$2a$10$dR0R0Wst9AHFKR0G94GqK.LZHaWajYxdQG8dqEGkqNJkV.5QA0kT.', 'admin'),
('cashier1', 'cashier1@bookstore.com', '$2a$10$nftyJ766BUDYV4Zzhb0BI.jHF1pDdOcwMtK5vxGD9AgXT/6xshnMq', 'cashier'),
('cashier2', 'cashier2@bookstore.com', '$2a$10$nftyJ766BUDYV4Zzhb0BI.jHF1pDdOcwMtK5vxGD9AgXT/6xshnMq', 'cashier');

-- ============================================================
-- CATEGORIES
-- ============================================================
INSERT INTO categories (name, description, color) VALUES
('Fiction', 'Novels, short stories, and other fictional works', '#8B4513'),
('Non-Fiction', 'Biographies, essays, and factual books', '#2E7D32'),
('Academic', 'Textbooks and educational materials', '#1565C0'),
('Children''s Books', 'Books for young readers', '#F57F17'),
('Comics & Manga', 'Graphic novels, comics, and manga', '#6A1B9A'),
('Science & Technology', 'Science, engineering, and tech books', '#00695C'),
('Self-Help', 'Personal development and motivational books', '#BF360C'),
('History', 'Historical accounts and reference books', '#4E342E');

-- ============================================================
-- BOOKS
-- ============================================================
INSERT INTO books (title, author, isbn, category_id, price, cost_price, stock_qty, low_stock_threshold, publisher, published_year, description) VALUES
('The Great Gatsby', 'F. Scott Fitzgerald', '9780743273565', 1, 12.99, 6.00, 45, 10, 'Scribner', 1925, 'A classic American novel set in the Jazz Age.'),
('To Kill a Mockingbird', 'Harper Lee', '9780061935466', 1, 14.99, 7.00, 32, 10, 'HarperCollins', 1960, 'A gripping tale of racial injustice in the American South.'),
('1984', 'George Orwell', '9780451524935', 1, 11.99, 5.50, 60, 10, 'Signet Classic', 1949, 'A dystopian social science fiction novel.'),
('Sapiens', 'Yuval Noah Harari', '9780062316097', 2, 19.99, 10.00, 28, 8, 'Harper', 2011, 'A brief history of humankind.'),
('Atomic Habits', 'James Clear', '9780735211292', 7, 18.99, 9.00, 55, 10, 'Avery', 2018, 'Tiny changes, remarkable results.'),
('Introduction to Algorithms', 'Thomas H. Cormen', '9780262033848', 3, 89.99, 45.00, 12, 5, 'MIT Press', 2009, 'The classic computer science algorithms textbook.'),
('Python Crash Course', 'Eric Matthes', '9781593279288', 6, 35.99, 18.00, 22, 8, 'No Starch Press', 2019, 'A hands-on, project-based introduction to programming.'),
('The Very Hungry Caterpillar', 'Eric Carle', '9780399226908', 4, 9.99, 4.50, 70, 15, 'Philomel Books', 1969, 'A classic children''s picture book.'),
('Naruto Vol. 1', 'Masashi Kishimoto', '9781569319000', 5, 9.99, 4.00, 38, 10, 'Viz Media', 2003, 'The beginning of the Naruto manga series.'),
('Educated', 'Tara Westover', '9780399590504', 2, 16.99, 8.00, 25, 8, 'Random House', 2018, 'A memoir about a young girl who grows up in a survivalist family.'),
('The Alchemist', 'Paulo Coelho', '9780062315007', 1, 13.99, 6.50, 48, 10, 'HarperOne', 1988, 'A magical story about following your dreams.'),
('Brief History of Time', 'Stephen Hawking', '9780553380163', 6, 15.99, 7.50, 18, 5, 'Bantam', 1988, 'A landmark volume in science writing.'),
('Harry Potter and the Sorcerer''s Stone', 'J.K. Rowling', '9780439708180', 1, 12.99, 6.00, 85, 15, 'Scholastic', 1997, 'The first book in the beloved Harry Potter series.'),
('The Lean Startup', 'Eric Ries', '9780307887894', 2, 17.99, 8.50, 30, 8, 'Crown Business', 2011, 'How entrepreneurs use continuous innovation.'),
('Dune', 'Frank Herbert', '9780441013593', 1, 16.99, 8.00, 3, 10, 'Ace', 1965, 'An epic science fiction masterpiece.'),
('Good to Great', 'Jim Collins', '9780066620992', 2, 22.99, 11.00, 4, 5, 'HarperBusiness', 2001, 'Why some companies make the leap and others don''t.'),
('The Hobbit', 'J.R.R. Tolkien', '9780547928227', 1, 14.99, 7.00, 42, 10, 'Houghton Mifflin', 1937, 'A fantasy novel about the adventures of Bilbo Baggins.'),
('Calculus: Early Transcendentals', 'James Stewart', '9781285741550', 3, 299.99, 150.00, 8, 5, 'Cengage', 2015, 'Widely used calculus textbook for university students.'),
('One Piece Vol. 1', 'Eiichiro Oda', '9781569319017', 5, 9.99, 4.00, 55, 10, 'Viz Media', 1997, 'The beginning of the One Piece adventure.'),
('Think and Grow Rich', 'Napoleon Hill', '9781585424337', 7, 10.99, 5.00, 40, 8, 'Tarcher/Perigee', 1937, 'The classic guide to success and wealth building.');

-- ============================================================
-- CUSTOMERS
-- ============================================================
INSERT INTO customers (name, phone, email, total_purchases, total_spent) VALUES
('Rahul Sharma', '9876543210', 'rahul.sharma@email.com', 5, 142.50),
('Priya Patel', '9812345678', 'priya.patel@email.com', 3, 67.80),
('Amit Kumar', '9900112233', 'amit.kumar@email.com', 8, 312.45),
('Sunita Verma', '9988776655', 'sunita.verma@email.com', 2, 45.00),
('Ravi Singh', '9123456789', 'ravi.singh@email.com', 12, 589.20),
('Anjali Mehta', '9765432101', 'anjali.mehta@email.com', 1, 18.99),
('Deepak Joshi', '9654321098', 'deepak.joshi@email.com', 6, 198.75);

-- ============================================================
-- SAMPLE SALES (last 30 days)
-- ============================================================
INSERT INTO sales (customer_id, cashier_id, subtotal, discount, tax, total_amount, payment_method, created_at) VALUES
(1, 2, 45.97, 0, 4.14, 50.11, 'cash', NOW() - INTERVAL '1 day'),
(2, 2, 31.98, 2.00, 2.70, 32.68, 'card', NOW() - INTERVAL '2 days'),
(3, 1, 89.99, 5.00, 7.65, 92.64, 'upi', NOW() - INTERVAL '3 days'),
(4, 2, 22.98, 0, 2.07, 25.05, 'cash', NOW() - INTERVAL '5 days'),
(5, 1, 54.96, 0, 4.95, 59.91, 'card', NOW() - INTERVAL '7 days'),
(1, 2, 35.97, 3.00, 2.97, 35.94, 'cash', NOW() - INTERVAL '10 days'),
(3, 2, 120.97, 10.00, 9.99, 120.96, 'card', NOW() - INTERVAL '12 days'),
(6, 1, 18.99, 0, 1.71, 20.70, 'cash', NOW() - INTERVAL '15 days'),
(7, 2, 67.95, 5.00, 5.67, 68.62, 'upi', NOW() - INTERVAL '18 days'),
(2, 1, 28.97, 0, 2.61, 31.58, 'cash', NOW() - INTERVAL '20 days');

-- ============================================================
-- SALE ITEMS
-- ============================================================
INSERT INTO sale_items (sale_id, book_id, book_title, book_author, quantity, unit_price, subtotal) VALUES
(1, 1, 'The Great Gatsby', 'F. Scott Fitzgerald', 1, 12.99, 12.99),
(1, 5, 'Atomic Habits', 'James Clear', 1, 18.99, 18.99),
(1, 9, 'Naruto Vol. 1', 'Masashi Kishimoto', 1, 9.99, 9.99),
(2, 11, 'The Alchemist', 'Paulo Coelho', 1, 13.99, 13.99),
(2, 8, 'The Very Hungry Caterpillar', 'Eric Carle', 1, 9.99, 9.99),
(2, 19, 'One Piece Vol. 1', 'Eiichiro Oda', 1, 9.99, 9.99),
(3, 6, 'Introduction to Algorithms', 'Thomas H. Cormen', 1, 89.99, 89.99),
(4, 3, '1984', 'George Orwell', 1, 11.99, 11.99),
(4, 20, 'Think and Grow Rich', 'Napoleon Hill', 1, 10.99, 10.99),
(5, 4, 'Sapiens', 'Yuval Noah Harari', 1, 19.99, 19.99),
(5, 5, 'Atomic Habits', 'James Clear', 1, 18.99, 18.99),
(5, 12, 'Brief History of Time', 'Stephen Hawking', 1, 15.99, 15.99);
