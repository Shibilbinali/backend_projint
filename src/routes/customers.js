const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  downloadCustomerTemplate,
  getCustomerImportHistory,
  getCustomerImportSessionStatus,
  importCustomers,
  exportCustomers,
  getImportReports,
  downloadImportReport
} = require('../controllers/customersController');
const { authenticate } = require('../middleware/auth');

const customerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only CSV and XLSX files are allowed'), ok);
  }
});

// Import endpoints (must come before dynamic :id route)
router.get('/export', authenticate, exportCustomers);
router.get('/import-template', authenticate, downloadCustomerTemplate);
router.get('/import-reports', authenticate, getImportReports);
router.get('/import-reports/:id/download', authenticate, downloadImportReport);
router.get('/import-history', authenticate, getCustomerImportHistory);
router.get('/import-history/:id', authenticate, getCustomerImportSessionStatus);
router.post('/import', authenticate, customerUpload.single('file'), importCustomers);

router.get('/', authenticate, getCustomers);
router.get('/:id', authenticate, getCustomerById);
router.post('/', authenticate, createCustomer);
router.put('/:id', authenticate, updateCustomer);
router.delete('/:id', authenticate, deleteCustomer);

module.exports = router;
