const express = require('express');
const router = express.Router();
const { runCatalogAudit } = require('../controllers/catalogAuditController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Route for running the catalog audit
router.post('/run', authenticate, requireAdmin, runCatalogAudit);

module.exports = router;
