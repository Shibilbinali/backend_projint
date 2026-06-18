const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const getUsers = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { username, email, password, role = 'cashier' } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required.' });
    }
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, is_active, created_at`,
      [username, email, password_hash, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { username, email, role, is_active } = req.body;

    // 1. Fetch current target user state
    const userRes = await pool.query('SELECT username, role, is_active FROM users WHERE id = $1', [req.params.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const targetUser = userRes.rows[0];

    // 2. Validate: Prevent Admin accounts from being deactivated/disabled
    if (targetUser.role === 'admin' && is_active === false) {
      return res.status(400).json({ message: 'Admin accounts cannot be deactivated.' });
    }

    // 3. Update the user
    const result = await pool.query(
      `UPDATE users SET
        username = COALESCE($1, username),
        email = COALESCE($2, email),
        role = COALESCE($3, role),
        is_active = COALESCE($4, is_active),
        updated_at = NOW()
       WHERE id = $5 RETURNING id, username, email, role, is_active`,
      [username, email, role, is_active, req.params.id]
    );

    const updatedUser = result.rows[0];

    // 4. Record Audit Log if the active status is toggled
    if (is_active !== undefined && is_active !== null && is_active !== targetUser.is_active) {
      const adminName = req.user.username;
      const cashierName = targetUser.username;
      const action = is_active ? 'Activate' : 'Deactivate';
      await pool.query(
        'INSERT INTO audit_logs (admin_name, action, cashier_name) VALUES ($1, $2, $3)',
        [adminName, action, cashierName]
      );
    }

    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account.' });
    }

    // 1. Fetch current target user state
    const userRes = await pool.query('SELECT username, role FROM users WHERE id = $1', [req.params.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const targetUser = userRes.rows[0];

    // 2. Validate: Prevent Admin accounts from being deleted
    if (targetUser.role === 'admin') {
      return res.status(400).json({ message: 'Admin accounts cannot be deleted.' });
    }

    // 3. Perform hard delete
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);

    // 4. Record Audit Log for Delete action
    const adminName = req.user.username;
    const cashierName = targetUser.username;
    await pool.query(
      'INSERT INTO audit_logs (admin_name, action, cashier_name) VALUES ($1, $2, $3)',
      [adminName, 'Delete', cashierName]
    );

    res.json({ message: 'User deleted permanently.' });
  } catch (error) {
    next(error);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, admin_name, action, cashier_name, created_at FROM audit_logs ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser, getAuditLogs };
