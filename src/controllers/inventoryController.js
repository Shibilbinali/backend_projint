const pool = require('../config/db');

const getInventory = async (req, res, next) => {
  try {
    const { search, low_stock } = req.query;
    let whereClause = 'WHERE b.is_active = true';
    const values = [];

    if (search) {
      values.push(`%${search}%`);
      whereClause += ` AND (b.title ILIKE $${values.length} OR b.author ILIKE $${values.length})`;
    }
    if (low_stock === 'true') {
      whereClause += ` AND b.stock_qty <= b.low_stock_threshold`;
    }

    const result = await pool.query(
      `SELECT b.id, b.title, b.author, b.isbn, b.stock_qty, b.low_stock_threshold,
              b.price, b.cost_price, c.name as category_name, c.color as category_color,
              CASE
                WHEN b.stock_qty = 0 THEN 'out_of_stock'
                WHEN b.stock_qty <= b.low_stock_threshold THEN 'low_stock'
                ELSE 'in_stock'
              END as stock_status
       FROM books b
       LEFT JOIN categories c ON b.category_id = c.id
       ${whereClause}
       ORDER BY b.stock_qty ASC`,
      values
    );

    const summary = await pool.query(
      `SELECT
        COUNT(*) as total_books,
        SUM(stock_qty) as total_stock,
        COUNT(CASE WHEN stock_qty = 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN stock_qty > 0 AND stock_qty <= low_stock_threshold THEN 1 END) as low_stock
       FROM books WHERE is_active = true`
    );

    res.json({ books: result.rows, summary: summary.rows[0] });
  } catch (error) {
    next(error);
  }
};

const updateStock = async (req, res, next) => {
  try {
    const { stock_qty, low_stock_threshold } = req.body;
    if (stock_qty === undefined) {
      return res.status(400).json({ message: 'stock_qty is required.' });
    }

    const result = await pool.query(
      `UPDATE books SET
        stock_qty = $1,
        low_stock_threshold = COALESCE($2, low_stock_threshold),
        updated_at = NOW()
       WHERE id = $3 AND is_active = true RETURNING id, title, stock_qty, low_stock_threshold`,
      [stock_qty, low_stock_threshold, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

module.exports = { getInventory, updateStock };
