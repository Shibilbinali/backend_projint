const express = require('express');
const router = express.Router();
const { getInventory, updateStock } = require('../controllers/inventoryController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/', authenticate, getInventory);
router.put('/:id/stock', authenticate, requireAdmin, updateStock);

module.exports = router;
