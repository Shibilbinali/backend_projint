const express = require('express');
const router = express.Router();
const { getBooks, getBookById, createBook, updateBook, deleteBook, fetchMetadataEndpoint, refreshMetadataEndpoint, auditBooks, getAuditReport } = require('../controllers/booksController');
const { verifyCategoriesEndpoint, getManualReviewBooks, approveBookCategory, suggestBookCategory, rejectBookCategorySuggestion, getVerifyCategoriesReport } = require('../controllers/categoryVerificationController');
const { authenticate, requireAdmin } = require('../middleware/auth');

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getImageDimensions } = require('../utils/imageValidator');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images (JPEG, PNG, WEBP) are allowed.'));
  }
});

router.get('/', authenticate, getBooks);
router.post('/verify-categories', authenticate, requireAdmin, verifyCategoriesEndpoint);
router.get('/verify-categories-report', authenticate, getVerifyCategoriesReport);
router.get('/manual-review', authenticate, getManualReviewBooks); // Cashier can read
router.post('/fetch-metadata', authenticate, requireAdmin, fetchMetadataEndpoint);
router.post('/audit', authenticate, requireAdmin, auditBooks);
router.get('/audit-report', authenticate, getAuditReport); // Cashier can read
router.get('/:id', authenticate, getBookById);
router.post('/:id/refresh', authenticate, requireAdmin, refreshMetadataEndpoint);
router.post('/:id/approve-category', authenticate, requireAdmin, approveBookCategory);
router.post('/:id/suggest-category', authenticate, suggestBookCategory); // Cashier suggestion
router.post('/:id/reject-suggestion', authenticate, requireAdmin, rejectBookCategorySuggestion); // Admin rejects suggestion
router.post('/', authenticate, requireAdmin, createBook);
router.put('/:id', authenticate, requireAdmin, updateBook);
router.delete('/:id', authenticate, requireAdmin, deleteBook);

router.post('/upload', authenticate, requireAdmin, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    try {
      const buffer = await fs.promises.readFile(req.file.path);
      const dimensions = getImageDimensions(buffer);

      if (dimensions.width < 100 || dimensions.height < 100) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message: `Image resolution is too low (${dimensions.width}x${dimensions.height}). Minimum is 100x100 pixels.`
        });
      }

      const url = `/uploads/${req.file.filename}`;
      res.json({ url, dimensions });
    } catch (validationErr) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ message: `Invalid image: ${validationErr.message}` });
    }
  });
});

module.exports = router;
