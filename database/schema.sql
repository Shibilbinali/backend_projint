-- ============================================================
-- BOOKSTORE POS - DATABASE SCHEMA
-- ============================================================

-- Drop tables if exist (for clean reinstall)
DROP TABLE IF EXISTS book_secondary_categories CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS books CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'cashier')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7) DEFAULT '#8B4513',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- BOOKS
-- ============================================================
CREATE TABLE books (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(20),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    cost_price DECIMAL(10, 2) DEFAULT 0,
    stock_qty INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    cover_image_url TEXT,
    front_cover_url TEXT,
    back_cover_url TEXT,
    cover_source VARCHAR(100) DEFAULT 'None',
    edition VARCHAR(50),
    tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
    publisher VARCHAR(255),
    published_year INTEGER,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    reading_age VARCHAR(50) DEFAULT 'All Ages',
    price_type VARCHAR(20) DEFAULT 'Premium' CHECK (price_type IN ('Free', 'Premium')),
    tags VARCHAR(500),
    page_count INTEGER DEFAULT 0,
    format VARCHAR(50) DEFAULT 'Printed' CHECK (format IN ('Printed', 'Digital')),
    needs_manual_review BOOLEAN DEFAULT FALSE,
    categorization_confidence DECIMAL(3, 2) DEFAULT 1.00,
    categorization_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- BOOK SECONDARY CATEGORIES
-- ============================================================
CREATE TABLE book_secondary_categories (
    book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, category_id)
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    total_purchases INTEGER DEFAULT 0,
    total_spent DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SALES
-- ============================================================
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    cashier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    tax DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(20) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'upi', 'other')),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'pending')),
    notes TEXT,
    is_round_off BOOLEAN DEFAULT FALSE,
    invoice_number VARCHAR(100),
    invoice_date DATE,
    invoice_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SALE ITEMS
-- ============================================================
CREATE TABLE sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
    book_title VARCHAR(500),
    book_author VARCHAR(255),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    discount_applied DECIMAL(10, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    final_price DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_books_category ON books(category_id);
CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_sales_created_at ON sales(created_at);
CREATE INDEX idx_sales_cashier ON sales(cashier_id);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_book ON sale_items(book_id);
