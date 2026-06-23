const pool = require('../config/db');

/**
 * GET /api/settings/store
 * Retrieve the global store settings (singleton id=1).
 */
const getStoreSettings = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM store_settings WHERE id = 1');
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Store settings not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/settings/store
 * Update the global store settings. Restricted to Admin.
 */
const updateStoreSettings = async (req, res, next) => {
  const { store_name, store_email, store_phone } = req.body;

  if (!store_name || !store_name.trim()) {
    return res.status(400).json({ message: 'Store name is required.' });
  }
  if (!store_email || !store_email.trim()) {
    return res.status(400).json({ message: 'Store email is required.' });
  }
  if (!store_phone || !store_phone.trim()) {
    return res.status(400).json({ message: 'Store phone number is required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE store_settings 
       SET store_name = $1, store_email = $2, store_phone = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE id = 1 
       RETURNING *`,
      [store_name.trim(), store_email.trim(), store_phone.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Store settings not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/settings/payment
 * Retrieve global payment/UPI settings (singleton id=1).
 */
const getPaymentSettings = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM payment_settings WHERE id = 1');
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Payment settings not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/settings/payment
 * Update the global payment settings. Restricted to Admin.
 */
const updatePaymentSettings = async (req, res, next) => {
  const { upi_enabled, upi_id, merchant_name } = req.body;

  if (upi_enabled === undefined) {
    return res.status(400).json({ message: 'UPI enabled switch is required.' });
  }
  if (!upi_id || !upi_id.trim()) {
    return res.status(400).json({ message: 'UPI ID is required.' });
  }
  if (!merchant_name || !merchant_name.trim()) {
    return res.status(400).json({ message: 'Merchant name is required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE payment_settings 
       SET upi_enabled = $1, upi_id = $2, merchant_name = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE id = 1 
       RETURNING *`,
      [!!upi_enabled, upi_id.trim(), merchant_name.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Payment settings not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStoreSettings,
  updateStoreSettings,
  getPaymentSettings,
  updatePaymentSettings,
};
