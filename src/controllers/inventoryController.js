const pool = require('../config/db');

const getInventory = async (req, res, next) => {
  try {
    const { search, low_stock, page = 1, limit = 15 } = req.query;
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const offset = (parsedPage - 1) * parsedLimit;
    
    let whereClause = 'WHERE b.is_active = true';
    const values = [];

    if (search) {
      values.push(`%${search}%`);
      whereClause += ` AND (b.title ILIKE $${values.length} OR b.author ILIKE $${values.length})`;
    }
    if (low_stock === 'true') {
      whereClause += ` AND b.stock_qty <= b.low_stock_threshold`;
    }

    const query = `
      SELECT b.id, b.title, b.author, b.isbn, b.stock_qty, b.low_stock_threshold,
              b.price, b.cost_price, c.name as category_name, c.color as category_color,
              CASE
                WHEN b.stock_qty = 0 THEN 'out_of_stock'
                WHEN b.stock_qty <= b.low_stock_threshold THEN 'low_stock'
                ELSE 'in_stock'
              END as stock_status
       FROM books b
       LEFT JOIN categories c ON b.category_id = c.id
       ${whereClause}
       ORDER BY b.stock_qty ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const countQuery = `
      SELECT COUNT(*) FROM books b ${whereClause}
    `;

    const summaryQuery = `
      SELECT
        COUNT(*) as total_books,
        SUM(stock_qty) as total_stock,
        COUNT(CASE WHEN stock_qty = 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN stock_qty > 0 AND stock_qty <= low_stock_threshold THEN 1 END) as low_stock
       FROM books WHERE is_active = true
    `;

    const [booksResult, countResult, summaryResult] = await Promise.all([
      pool.query(query, [...values, parsedLimit, offset]),
      pool.query(countQuery, values),
      pool.query(summaryQuery)
    ]);

    const total = parseInt(countResult.rows[0].count);

    res.json({ 
      books: booksResult.rows, 
      summary: summaryResult.rows[0],
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit)
    });
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
