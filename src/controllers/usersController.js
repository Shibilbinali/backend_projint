const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Helper: safely log to audit_logs (non-fatal — won't crash the main action)
const logAuditAction = async (adminName, action, cashierName) => {
  try {
    await pool.query(
      'INSERT INTO audit_logs (admin_name, action, cashier_name) VALUES ($1, $2, $3)',
      [adminName, action, cashierName]
    );
    console.log(`[Audit] ${adminName} performed "${action}" on ${cashierName}`);
  } catch (auditErr) {
    // Non-fatal: log warning but don't propagate
    console.warn(`[Audit] WARNING: Failed to write audit log for action "${action}" by "${adminName}" on "${cashierName}". Error: ${auditErr.message}`);
  }
};

const getUsers = async (req, res, next) => {
  try {
    console.log(`[Users] GET /users requested by user ${req.user?.username} (id=${req.user?.id})`);
    const result = await pool.query(
      'SELECT id, username, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    console.log(`[Users] Returning ${result.rows.length} users`);
    res.json(result.rows);
  } catch (error) {
    console.error(`[Users] getUsers error: ${error.message}`, error.stack);
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { username, email, password, role = 'cashier' } = req.body;
    console.log(`[Users] CREATE user requested by ${req.user?.username}: username="${username}", role="${role}"`);

    if (!username || !email || !password) {
      console.warn('[Users] createUser: Missing required fields');
      return res.status(400).json({ message: 'Username, email, and password are required.' });
    }

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, is_active, created_at`,
      [username, email, password_hash, role]
    );

    const newUser = result.rows[0];
    console.log(`[Users] User created successfully: id=${newUser.id}, username="${newUser.username}", role="${newUser.role}"`);

    // Log creation to audit trail
    await logAuditAction(req.user.username, 'Create', username);

    res.status(201).json(newUser);
  } catch (error) {
    console.error(`[Users] createUser error: ${error.message}`, error.stack);
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const { username, email, role, is_active } = req.body;

    console.log(`[Users] UPDATE user id=${userId} requested by ${req.user?.username}`);
    console.log(`[Users] Payload: ${JSON.stringify({ username, email, role, is_active })}`);

    // 1. Fetch current target user state
    const userRes = await pool.query(
      'SELECT id, username, role, is_active FROM users WHERE id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) {
      console.warn(`[Users] updateUser: user id=${userId} not found`);
      return res.status(404).json({ message: 'User not found.' });
    }

    const targetUser = userRes.rows[0];
    console.log(`[Users] Target user: username="${targetUser.username}", role="${targetUser.role}", is_active=${targetUser.is_active}`);

    // 2. Validate: Prevent Admin accounts from being deactivated/disabled
    if (targetUser.role === 'admin' && is_active === false) {
      console.warn(`[Users] updateUser: Blocked attempt to deactivate admin account "${targetUser.username}"`);
      return res.status(400).json({ message: 'Admin accounts cannot be deactivated.' });
    }

    // 3. Validate: Prevent changing role of admin account
    if (targetUser.role === 'admin' && role && role !== 'admin') {
      console.warn(`[Users] updateUser: Blocked attempt to change admin role for "${targetUser.username}"`);
      return res.status(400).json({ message: 'Admin account role cannot be changed.' });
    }

    // 4. Update the user
    const result = await pool.query(
      `UPDATE users SET
        username = COALESCE($1, username),
        email = COALESCE($2, email),
        role = COALESCE($3, role),
        is_active = COALESCE($4, is_active),
        updated_at = NOW()
       WHERE id = $5 RETURNING id, username, email, role, is_active`,
      [username || null, email || null, role || null, is_active !== undefined ? is_active : null, userId]
    );

    if (result.rows.length === 0) {
      console.warn(`[Users] updateUser: No rows returned after UPDATE for id=${userId}`);
      return res.status(404).json({ message: 'User not found or update failed.' });
    }

    const updatedUser = result.rows[0];
    console.log(`[Users] User updated: id=${updatedUser.id}, username="${updatedUser.username}", is_active=${updatedUser.is_active}`);

    // 5. Record Audit Log if the active status changed
    if (is_active !== undefined && is_active !== null && is_active !== targetUser.is_active) {
      const action = is_active ? 'Activate' : 'Deactivate';
      await logAuditAction(req.user.username, action, targetUser.username);
    }

    res.json(updatedUser);
  } catch (error) {
    console.error(`[Users] updateUser error: ${error.message}`, error.stack);
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);

    console.log(`[Users] DELETE user id=${userId} requested by ${req.user?.username} (id=${req.user?.id})`);

    // 1. Prevent self-deletion
    if (userId === req.user.id) {
      console.warn(`[Users] deleteUser: Blocked self-deletion by ${req.user.username}`);
      return res.status(400).json({ message: 'Cannot delete your own account.' });
    }

    // 2. Fetch target user
    const userRes = await pool.query(
      'SELECT id, username, role FROM users WHERE id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) {
      console.warn(`[Users] deleteUser: user id=${userId} not found`);
      return res.status(404).json({ message: 'User not found.' });
    }

    const targetUser = userRes.rows[0];
    console.log(`[Users] Target user for delete: username="${targetUser.username}", role="${targetUser.role}"`);

    // 3. Prevent deletion of admin accounts
    if (targetUser.role === 'admin') {
      console.warn(`[Users] deleteUser: Blocked attempt to delete admin account "${targetUser.username}"`);
      return res.status(400).json({ message: 'Admin accounts cannot be deleted.' });
    }

    // 4. Perform the deletion
    const deleteRes = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    console.log(`[Users] User "${targetUser.username}" (id=${userId}) deleted. Rows affected: ${deleteRes.rowCount}`);

    // 5. Record audit log (non-fatal)
    await logAuditAction(req.user.username, 'Delete', targetUser.username);

    res.json({ message: `User "${targetUser.username}" deleted permanently.` });
  } catch (error) {
    console.error(`[Users] deleteUser error: ${error.message}`, error.stack);
    next(error);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    console.log(`[Users] GET /audit-logs requested by ${req.user?.username}`);
    const result = await pool.query(
      'SELECT id, admin_name, action, cashier_name, created_at FROM audit_logs ORDER BY created_at DESC'
    );
    console.log(`[Users] Returning ${result.rows.length} audit log entries`);
    res.json(result.rows);
  } catch (error) {
    console.error(`[Users] getAuditLogs error: ${error.message}`, error.stack);
    // Return empty array if audit_logs table doesn't exist yet
    if (error.code === '42P01') {
      console.warn('[Users] audit_logs table does not exist yet — returning empty array');
      return res.json([]);
    }
    next(error);
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser, getAuditLogs };
