const express = require('express');
const router = express.Router();
const {
  getStoreSettings,
  updateStoreSettings,
  getPaymentSettings,
  updatePaymentSettings,
} = require('../controllers/settingsController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Store settings endpoints
router.get('/store', authenticate, getStoreSettings);
router.put('/store', authenticate, requireAdmin, updateStoreSettings);

// Payment settings endpoints
router.get('/payment', authenticate, getPaymentSettings);
router.put('/payment', authenticate, requireAdmin, updatePaymentSettings);

module.exports = router;
