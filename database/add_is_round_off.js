const pool = require('../src/config/db');

async function run() {
  try {
    await pool.query('ALTER TABLE sales ADD COLUMN is_round_off BOOLEAN DEFAULT FALSE;');
    console.log('✅ Column is_round_off added to sales table successfully.');
  } catch (err) {
    if (err.code === '42701') {
      console.log('ℹ️ Column is_round_off already exists.');
    } else {
      console.error('❌ Failed to migrate database:', err);
    }
  } finally {
    await pool.end();
  }
}

run();
