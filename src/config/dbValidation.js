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
  `,
  category_suggestions: `
    CREATE TABLE IF NOT EXISTS category_suggestions (
        book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
        suggested_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        suggested_secondary_category_ids INTEGER[] DEFAULT '{}',
        cashier_name VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `,

  book_import_sessions: `
    CREATE TABLE IF NOT EXISTS book_import_sessions (
        id SERIAL PRIMARY KEY,
        imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        file_name VARCHAR(255),
        total_rows INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        updated_count INTEGER DEFAULT 0,
        skipped_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        covers_imported_count INTEGER DEFAULT 0,
        failed_covers_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
        errors JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
    );
  `,
  customer_import_sessions: `
    CREATE TABLE IF NOT EXISTS customer_import_sessions (
        id SERIAL PRIMARY KEY,
        imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        file_name VARCHAR(255),
        total_rows INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        updated_count INTEGER DEFAULT 0,
        skipped_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
        errors JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
    );
  `,
  customer_import_reports: `
    CREATE TABLE IF NOT EXISTS customer_import_reports (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(255),
        imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        total_records INTEGER DEFAULT 0,
        failed_records INTEGER DEFAULT 0,
        duplicate_records INTEGER DEFAULT 0,
        pdf_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `,

  audit_logs: `
    CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        admin_name VARCHAR(100) NOT NULL,
        action VARCHAR(50) NOT NULL,
        cashier_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `,
  store_settings: `
    CREATE TABLE IF NOT EXISTS store_settings (
        id SERIAL PRIMARY KEY,
        store_name VARCHAR(200) DEFAULT 'BookStore POS',
        store_email VARCHAR(255) DEFAULT 'Bookstorepos@gmail.com',
        store_phone VARCHAR(20) DEFAULT '9559440043',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `,
  payment_settings: `
    CREATE TABLE IF NOT EXISTS payment_settings (
        id SERIAL PRIMARY KEY,
        upi_enabled BOOLEAN DEFAULT TRUE,
        upi_id VARCHAR(100) DEFAULT 'bookstorepos@upi',
        merchant_name VARCHAR(200) DEFAULT 'BookStore POS',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    { name: 'categorization_notes', definition: "TEXT" },
    { name: 'cover_image', definition: "TEXT" }
  ],
  book_import_sessions: [
    { name: 'covers_imported_count', definition: "INTEGER DEFAULT 0" },
    { name: 'failed_covers_count', definition: "INTEGER DEFAULT 0" }
  ],
  sales: [
    { name: 'invoice_number', definition: "VARCHAR(100)" },
    { name: 'invoice_date', definition: "DATE" },
    { name: 'invoice_time', definition: "TIME" },
    { name: 'is_round_off', definition: "BOOLEAN DEFAULT FALSE" },
    { name: 'source', definition: "VARCHAR(30) DEFAULT 'pos'" }
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

    // Ensure default store settings exist
    const storeSettingsCheck = await pool.query("SELECT id FROM store_settings LIMIT 1");
    if (storeSettingsCheck.rows.length === 0) {
      console.log('Inserting default store settings...');
      await pool.query(
        "INSERT INTO store_settings (id, store_name, store_email, store_phone) VALUES (1, 'BookStore POS', 'Bookstorepos@gmail.com', '9559440043') ON CONFLICT (id) DO NOTHING"
      );
      console.log('✅ Default store settings inserted.');
    }

    // Ensure default payment settings exist
    const paymentSettingsCheck = await pool.query("SELECT id FROM payment_settings LIMIT 1");
    if (paymentSettingsCheck.rows.length === 0) {
      console.log('Inserting default payment settings...');
      await pool.query(
        "INSERT INTO payment_settings (id, upi_enabled, upi_id, merchant_name) VALUES (1, true, 'bookstorepos@upi', 'BookStore POS') ON CONFLICT (id) DO NOTHING"
      );
      console.log('✅ Default payment settings inserted.');
    }

    // 4. Ensure performance indexes exist
    const REQUIRED_INDEXES = [
      // Books: is_active is filtered on nearly every books query
      `CREATE INDEX IF NOT EXISTS idx_books_is_active ON books (is_active)`,
      // Books: ISBN search and deduplication
      `CREATE INDEX IF NOT EXISTS idx_books_isbn ON books (isbn)`,
      // Books: author search
      `CREATE INDEX IF NOT EXISTS idx_books_author ON books (author)`,
      // Books: stock level queries (low_stock, out_of_stock filters)
      `CREATE INDEX IF NOT EXISTS idx_books_stock_qty ON books (stock_qty)`,
      // Sales: customer and status filtering
      `CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales (customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status)`,
      // Sales: invoice number lookups
      `CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales (invoice_number)`,
      // Audit logs: ordering by time
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)`,
      // Customers: phone lookups
      `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone)`,
      // Users: role filtering (admin checks)
      `CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)`,
      // Users: is_active filtering
      `CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active)`,
    ];

    for (const indexSql of REQUIRED_INDEXES) {
      try {
        await pool.query(indexSql);
      } catch (idxErr) {
        console.warn(`⚠️ Could not create index (${indexSql.substring(0, 60)}...): ${idxErr.message}`);
      }
    }
    console.log('📊 Performance indexes verified.');

    console.log('💪 Database validation and auto-migration check complete. Database is healthy.');
  } catch (error) {
    console.error('❌ Database validation/migration failed:');
    console.error(error);
  }
}

module.exports = { validateAndMigrateDb };
