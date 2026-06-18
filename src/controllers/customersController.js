const pool = require('../config/db');

const getCustomers = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const values = [];
    let whereClause = '';

    if (search) {
      values.push(`%${search}%`);
      whereClause = `WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1`;
    }

    const result = await pool.query(
      `SELECT * FROM customers ${whereClause} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM customers ${whereClause}`,
      values
    );

    res.json({
      customers: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
    });
  } catch (error) {
    next(error);
  }
};

const getCustomerById = async (req, res, next) => {
  try {
    const customerId = req.params.id;

    // 1. Fetch customer details
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [customerId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found.' });
    }
    const customer = customerResult.rows[0];

    // 2. Calculate profile stats and dashboard metrics
    const statsQuery = `
      SELECT 
        COUNT(s.id) as total_orders,
        COALESCE(SUM(s.total_amount), 0) as total_amount_spent,
        MAX(s.created_at) as last_purchase_date
      FROM sales s
      WHERE s.customer_id = $1
    `;
    const statsRes = await pool.query(statsQuery, [customerId]);
    const { total_orders, total_amount_spent, last_purchase_date } = statsRes.rows[0];

    const booksQuery = `
      SELECT COALESCE(SUM(si.quantity), 0) as total_books_purchased
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.customer_id = $1
    `;
    const booksRes = await pool.query(booksQuery, [customerId]);
    const total_books_purchased = parseInt(booksRes.rows[0].total_books_purchased);

    // Favorite Category
    const favCatQuery = `
      SELECT c.name, SUM(si.quantity) as qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN books b ON si.book_id = b.id
      JOIN categories c ON b.category_id = c.id
      WHERE s.customer_id = $1
      GROUP BY c.name
      ORDER BY qty DESC, c.name ASC
      LIMIT 1
    `;
    const favCatRes = await pool.query(favCatQuery, [customerId]);
    const favorite_category = favCatRes.rows.length > 0 ? favCatRes.rows[0].name : '—';

    // Most Purchased Book
    const mostPurchasedBookQuery = `
      SELECT si.book_title, SUM(si.quantity) as qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.customer_id = $1
      GROUP BY si.book_title
      ORDER BY qty DESC, si.book_title ASC
      LIMIT 1
    `;
    const mostPurchasedBookRes = await pool.query(mostPurchasedBookQuery, [customerId]);
    const most_purchased_book = mostPurchasedBookRes.rows.length > 0 ? mostPurchasedBookRes.rows[0].book_title : '—';

    // Average Order Value
    const avgOrderVal = total_orders > 0 ? parseFloat(total_amount_spent) / parseInt(total_orders) : 0;

    // 3. Fetch full purchase history
    const historyQuery = `
      SELECT 
        s.id as order_id,
        s.invoice_number,
        s.invoice_date,
        s.invoice_time,
        si.book_title,
        si.book_author,
        c.name as category_name,
        si.quantity,
        si.unit_price,
        COALESCE(si.tax_amount, ((si.unit_price * si.quantity) * COALESCE(b.tax_rate, 0) / 100)) as tax_amount,
        COALESCE(si.discount_applied, 0) as discount_applied,
        COALESCE(si.final_price, ((si.unit_price * si.quantity) + ((si.unit_price * si.quantity) * COALESCE(b.tax_rate, 0) / 100))) as final_price,
        s.created_at as purchase_date_time,
        s.payment_method,
        s.status as order_status,
        u.username as cashier_name
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN books b ON si.book_id = b.id
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE s.customer_id = $1
      ORDER BY s.created_at DESC
    `;
    const historyRes = await pool.query(historyQuery, [customerId]);

    res.json({
      ...customer,
      stats: {
        total_orders: parseInt(total_orders),
        total_books_purchased,
        total_amount_spent: parseFloat(total_amount_spent),
        last_purchase_date,
        favorite_category,
        most_purchased_book,
        average_order_value: avgOrderVal
      },
      purchase_history: historyRes.rows
    });
  } catch (error) {
    next(error);
  }
};

const createCustomer = async (req, res, next) => {
  try {
    const { name, phone, email, address, notes } = req.body;
    if (!name) return res.status(400).json({ message: 'Customer name is required.' });

    // Validate phone number format
    const phoneRegex = /^\+?[0-9\s\-()]{10,15}$/;
    if (phone && !phoneRegex.test(phone)) {
      return res.status(400).json({ message: 'Invalid phone number format. Must be between 10 and 15 digits.' });
    }

    // Check for duplicate phone number
    if (phone) {
      const existing = await pool.query('SELECT id FROM customers WHERE phone = $1', [phone]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ message: 'A customer with this phone number already exists.' });
      }
    }

    const result = await pool.query(
      'INSERT INTO customers (name, phone, email, address, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, phone || null, email || null, address || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

const updateCustomer = async (req, res, next) => {
  try {
    const { name, phone, email, address, notes } = req.body;

    // Validate phone number format
    const phoneRegex = /^\+?[0-9\s\-()]{10,15}$/;
    if (phone && !phoneRegex.test(phone)) {
      return res.status(400).json({ message: 'Invalid phone number format. Must be between 10 and 15 digits.' });
    }

    // Check for duplicate phone number
    if (phone) {
      const existing = await pool.query('SELECT id FROM customers WHERE phone = $1 AND id != $2', [phone, req.params.id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ message: 'A customer with this phone number already exists.' });
      }
    }

    const result = await pool.query(
      `UPDATE customers SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        email = COALESCE($3, email),
        address = COALESCE($4, address),
        notes = COALESCE($5, notes),
        updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, phone, email, address, notes, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Customer not found.' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

const deleteCustomer = async (req, res, next) => {
  try {
    await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Customer deleted.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer };
