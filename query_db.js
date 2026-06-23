require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

async function run() {
  try {
    const activeCount = await p.query('SELECT count(*) FROM books WHERE is_active = true');
    console.log('Active books count:', activeCount.rows[0].count);

    const activeBooks = await p.query('SELECT title, isbn, price, is_active FROM books WHERE is_active = true LIMIT 5');
    console.log('=== ACTIVE BOOKS ===');
    console.log(activeBooks.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await p.end();
  }
}
run();
