require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function run() {
  try {
    // Check UNIQUE indexes on customers
    const indexes = await p.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'customers'
    `);
    console.log('=== CUSTOMERS INDEXES ===');
    console.log(JSON.stringify(indexes.rows, null, 2));

    // Check UNIQUE indexes on sales
    const salesIdx = await p.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'sales'
    `);
    console.log('\n=== SALES INDEXES ===');
    console.log(JSON.stringify(salesIdx.rows, null, 2));

    // Test: what happens with ON CONFLICT (phone) when phone has no unique index?
    console.log('\n=== TESTING ON CONFLICT BEHAVIOR ===');
    try {
      await p.query('BEGIN');
      await p.query(`
        INSERT INTO customers (name, phone, created_at, updated_at)
        VALUES ('test_conflict_check', '0000000000', NOW(), NOW())
        ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name RETURNING id
      `);
      await p.query('ROLLBACK');
      console.log('ON CONFLICT (phone) succeeded - phone has unique constraint');
    } catch (e) {
      await p.query('ROLLBACK');
      console.log('ON CONFLICT (phone) FAILED:', e.message);
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await p.end();
  }
}
run();
