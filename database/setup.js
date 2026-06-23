require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Diagnostic logging before loading config
console.log('🔍 Environment Diagnostics:');
console.log(`- NODE_ENV: ${process.env.NODE_ENV}`);
if (process.env.DATABASE_URL) {
  // Mask connection string password for safety
  const maskedUrl = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
  console.log(`- DATABASE_URL: Detected (${maskedUrl})`);
} else {
  console.log('- DATABASE_URL: ❌ NOT DETECTED (undefined)');
}

const pool = require('../src/config/db');

async function runSetup() {
  console.log('🏁 Starting database schema setup and seeding...');
  
  try {
    // 1. Read and execute schema.sql
    console.log('📖 Reading schema.sql...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('🛠️ Recreating tables...');
    await pool.query(schemaSql);
    console.log('✅ Schema tables created successfully.');

    // 2. Read and execute seed.sql
    console.log('📖 Reading seed.sql...');
    const seedPath = path.join(__dirname, 'seed.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    
    console.log('🌱 Seeding initial data (users, categories, customers, sales)...');
    await pool.query(seedSql);
    console.log('✅ Initial data seeded successfully.');

    // 3. Ensure default admin user exists and has correct credentials
    console.log('👑 Checking default admin account...');
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('password123', 10);
    const adminCheck = await pool.query(
      "SELECT * FROM users WHERE role = 'admin' OR username = 'admin' OR email = 'admin@bookstore.com' LIMIT 1"
    );

    if (adminCheck.rows.length === 0) {
      console.log('👑 Default admin account not found. Creating it...');
      await pool.query(
        "INSERT INTO users (username, email, password_hash, role, is_active) VALUES ('admin', 'admin@bookstore.com', $1, 'admin', true)",
        [hash]
      );
      console.log('✅ Default admin account created successfully.');
    } else {
      console.log('👑 Admin account already exists. Updating credentials for consistency...');
      await pool.query(
        "UPDATE users SET username = 'admin', email = $1, password_hash = $2, is_active = true WHERE id = $3",
        ['admin@bookstore.com', hash, adminCheck.rows[0].id]
      );
      console.log('✅ Admin credentials updated successfully.');
    }

    console.log('🎉 Database setup completed successfully!');
  } catch (error) {
    console.error('❌ Database setup failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runSetup();
