const express = require('express');
const router = express.Router();
const { getCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer } = require('../controllers/customersController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, getCustomers);
router.get('/:id', authenticate, getCustomerById);
router.post('/', authenticate, createCustomer);
router.put('/:id', authenticate, updateCustomer);
router.delete('/:id', authenticate, deleteCustomer);

module.exports = router;
