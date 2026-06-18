const express = require('express');
const router = express.Router();
const { getUsers, createUser, updateUser, deleteUser, getAuditLogs } = require('../controllers/usersController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/audit-logs', authenticate, requireAdmin, getAuditLogs);
router.get('/', authenticate, requireAdmin, getUsers);
router.post('/', authenticate, requireAdmin, createUser);
router.put('/:id', authenticate, requireAdmin, updateUser);
router.delete('/:id', authenticate, requireAdmin, deleteUser);

module.exports = router;
