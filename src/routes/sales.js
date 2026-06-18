const express = require('express');
const router = express.Router();
const { createSale, getSales, getSaleByIdHandler } = require('../controllers/salesController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, getSales);
router.get('/:id', authenticate, getSaleByIdHandler);
router.post('/', authenticate, createSale);

module.exports = router;
