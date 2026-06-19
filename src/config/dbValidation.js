const pool = require('./db');
const bcrypt = require('bcryptjs');

const REQUIRED_TABLES = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'cashier')),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `,
  categories: `
    CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        color VARCHAR(7) DEFAULT '#8B4513',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `,
  books: `
    CREATE TABLE IF NOT EXISTS books (
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
  `,
  customers: `
    CREATE TABLE IF NOT EXISTS customers (
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
  `,
  sales: `
    CREATE TABLE IF NOT EXISTS sales (
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
  `,
  sale_items: `
    CREATE TABLE IF NOT EXISTS sale_items (
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
  `,
  book_secondary_categories: `
    CREATE TABLE IF NOT EXISTS book_secondary_categories (
        book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (book_id, category_id)
    );
  `
};

const REQUIRED_COLUMNS = {
  books: [
    { name: 'reading_age', definition: "VARCHAR(50) DEFAULT 'All Ages'" },
    { name: 'price_type', definition: "VARCHAR(20) DEFAULT 'Premium' CHECK (price_type IN ('Free', 'Premium'))" },
    { name: 'tags', definition: "VARCHAR(500)" },
    { name: 'page_count', definition: "INTEGER DEFAULT 0" },
    { name: 'format', definition: "VARCHAR(50) DEFAULT 'Printed' CHECK (format IN ('Printed', 'Digital'))" },
    { name: 'needs_manual_review', definition: "BOOLEAN DEFAULT FALSE" },
    { name: 'categorization_confidence', definition: "DECIMAL(3, 2) DEFAULT 1.00" },
    { name: 'categorization_notes', definition: "TEXT" }
  ],
  sales: [
    { name: 'invoice_number', definition: "VARCHAR(100)" },
    { name: 'invoice_date', definition: "DATE" },
    { name: 'invoice_time', definition: "TIME" },
    { name: 'is_round_off', definition: "BOOLEAN DEFAULT FALSE" }
  ],
  sale_items: [
    { name: 'discount_applied', definition: "DECIMAL(10, 2) DEFAULT 0" },
    { name: 'tax_amount', definition: "DECIMAL(10, 2) DEFAULT 0" },
    { name: 'final_price', definition: "DECIMAL(10, 2) DEFAULT 0" }
  ]
};

async function validateAndMigrateDb() {
  console.log('🔍 Running startup database validation and auto-migration check...');
  
  try {
    // 1. Ensure all required tables exist
    for (const [tableName, createQuery] of Object.entries(REQUIRED_TABLES)) {
      const tableCheck = await pool.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)",
        [tableName]
      );
      
      if (!tableCheck.rows[0].exists) {
        console.log(`⚠️ Table "${tableName}" does not exist. Creating it now...`);
        await pool.query(createQuery);
        console.log(`✅ Table "${tableName}" created successfully.`);
      }
    }

    // 2. Ensure all required columns exist in each table
    for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
      // Get all existing columns for this table
      const columnRes = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [tableName]
      );
      
      const existingCols = columnRes.rows.map(r => r.column_name.toLowerCase());
      
      for (const col of columns) {
        if (!existingCols.includes(col.name.toLowerCase())) {
          console.log(`⚠️ Column "${col.name}" is missing in table "${tableName}". Adding it...`);
          await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.definition}`);
          console.log(`✅ Column "${col.name}" added to table "${tableName}".`);
        }
      }
    }

    // 3. Ensure a default admin user exists
    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' OR email = 'admin@bookstore.com' LIMIT 1"
    );

    if (adminCheck.rows.length === 0) {
      console.log('👑 Default admin account not found. Creating admin@bookstore.com...');
      const hash = bcrypt.hashSync('password123', 10);
      await pool.query(
        "INSERT INTO users (username, email, password_hash, role, is_active) VALUES ('admin', 'admin@bookstore.com', $1, 'admin', true)",
        [hash]
      );
      console.log('✅ Default admin account created successfully.');
    }

    console.log('💪 Database validation and auto-migration check complete. Database is healthy.');
  } catch (error) {
    console.error('❌ Database validation/migration failed:');
    console.error(error);
  }
}

module.exports = { validateAndMigrateDb };
