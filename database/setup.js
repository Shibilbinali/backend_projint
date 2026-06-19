const fs = require('fs');
const path = require('path');
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
