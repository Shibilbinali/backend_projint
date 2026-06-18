require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');

async function fix() {
  const hash = bcrypt.hashSync('password123', 10);
  await pool.query(
    'UPDATE users SET email = $1, password_hash = $2 WHERE username = $3',
    ['admin@bookstore.com', hash, 'admin']
  );
  const r = await pool.query('SELECT username, email, role FROM users WHERE role = $1', ['admin']);
  console.log('Updated admin:', r.rows[0]);
  process.exit();
}

fix().catch(e => { console.error(e.message); process.exit(1); });
