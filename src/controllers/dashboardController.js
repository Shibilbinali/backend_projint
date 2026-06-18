const pool = require('../config/db');

const getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const [salesStats, bookStats, dailyRevenue, lowStockBooks, topCategories] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as total_sales,
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN created_at::date = $1 THEN total_amount ELSE 0 END), 0) as today_revenue,
          COUNT(CASE WHEN created_at::date = $1 THEN 1 END) as today_sales,
          COUNT(CASE WHEN invoice_date = $2 THEN 1 END) as today_invoice_count
        FROM sales WHERE status = 'completed'
      `, [today, localDate]),

      pool.query(`
        SELECT
          COUNT(*) as total_books,
          COALESCE(SUM(stock_qty), 0) as total_stock,
          COUNT(CASE WHEN stock_qty <= low_stock_threshold AND stock_qty > 0 THEN 1 END) as low_stock_count,
          COUNT(CASE WHEN stock_qty = 0 THEN 1 END) as out_of_stock_count
        FROM books WHERE is_active = true
      `),

      pool.query(`
        SELECT
          DATE(created_at) as date,
          COALESCE(SUM(total_amount), 0) as revenue,
          COUNT(*) as sales_count
        FROM sales
        WHERE created_at >= NOW() - INTERVAL '30 days' AND status = 'completed'
        GROUP BY DATE(created_at)
        ORDER BY date
      `),

      pool.query(`
        SELECT id, title, author, stock_qty, low_stock_threshold, price
        FROM books
        WHERE is_active = true AND stock_qty <= low_stock_threshold
        ORDER BY stock_qty ASC
        LIMIT 5
      `),

      pool.query(`
        SELECT c.name, c.color, COALESCE(SUM(si.subtotal), 0) as revenue, COUNT(si.id) as items_sold
        FROM categories c
        LEFT JOIN books b ON c.id = b.category_id
        LEFT JOIN sale_items si ON b.id = si.book_id
        LEFT JOIN sales s ON si.sale_id = s.id AND s.status = 'completed'
        GROUP BY c.id, c.name, c.color
        ORDER BY revenue DESC
        LIMIT 6
      `)
    ]);

    res.json({
      stats: {
        ...salesStats.rows[0],
        ...bookStats.rows[0],
      },
      daily_revenue: dailyRevenue.rows,
      low_stock_books: lowStockBooks.rows,
      top_categories: topCategories.rows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboardStats };
