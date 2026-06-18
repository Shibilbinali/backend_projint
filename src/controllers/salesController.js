const pool = require('../config/db');

const createSale = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE sales IN EXCLUSIVE MODE');
    const { customer_id, items, discount = 0, tax: clientTax, payment_method = 'cash', notes, is_round_off = false } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Sale must have at least one item.' });
    }

    // Cashiers cannot supply a custom tax value — reject if they try
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && clientTax !== undefined && clientTax !== null && clientTax !== '') {
      return res.status(403).json({ message: 'Cashiers are not authorized to modify tax values.' });
    }

    // Use the exact manual discount value entered by the user
    const manualDiscount = parseFloat(discount) || 0;

    // Validate stock, collect book data, compute subtotal and per-item tax
    let subtotal = 0;
    let cartTax = 0;
    for (const item of items) {
      const bookResult = await client.query(
        'SELECT id, title, author, price, stock_qty, tax_rate FROM books WHERE id = $1 AND is_active = true FOR UPDATE',
        [item.book_id]
      );
      if (bookResult.rows.length === 0) {
        throw Object.assign(new Error(`Book ID ${item.book_id} not found.`), { status: 404 });
      }
      const book = bookResult.rows[0];
      if (book.stock_qty < item.quantity) {
        throw Object.assign(
          new Error(`Insufficient stock for "${book.title}". Available: ${book.stock_qty}`),
          { status: 400 }
        );
      }

      const unitPrice = item.unit_price || parseFloat(book.price);
      const taxRate = parseFloat(book.tax_rate) || 0;
      const itemSubtotal = unitPrice * item.quantity;
      const itemTax = itemSubtotal * taxRate / 100;

      item._book = book;
      item._unitPrice = unitPrice;
      item._taxRate = taxRate;
      item._itemSubtotal = itemSubtotal;
      item._itemTax = itemTax;

      subtotal += itemSubtotal;
      cartTax += itemTax;
    }

    // Tax is always server-computed from book tax rates (cashiers cannot override)
    const finalTax = Math.round(cartTax * 100) / 100;

    let roundOffDiscount = 0;
    if (is_round_off) {
      const grossTotal = subtotal + finalTax;
      const roundedTotal = Math.floor(grossTotal / 10) * 10;
      roundOffDiscount = Math.round((grossTotal - roundedTotal) * 100) / 100;
    }

    const totalDiscount = manualDiscount + roundOffDiscount;
    const totalAmount = subtotal - totalDiscount + finalTax;

    // Generate date-based invoice number (local timezone)
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const datePrefix = `${dd}/${mm}/${yy}`; // e.g. "18/06/26"

    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const lastInvoiceRes = await client.query(
      `SELECT invoice_number FROM sales 
       WHERE invoice_number LIKE $1 
       ORDER BY invoice_number DESC LIMIT 1`,
      [`${datePrefix}-%`]
    );

    let seq = 1;
    if (lastInvoiceRes.rows.length > 0) {
      const lastInvoiceNum = lastInvoiceRes.rows[0].invoice_number;
      if (lastInvoiceNum) {
        const parts = lastInvoiceNum.split('-');
        if (parts.length === 2) {
          const lastSeq = parseInt(parts[1], 10);
          if (!isNaN(lastSeq)) {
            seq = lastSeq + 1;
          }
        }
      }
    }
    const invoiceNumber = `${datePrefix}-${String(seq).padStart(3, '0')}`;

    // Create sale record
    const saleResult = await client.query(
      `INSERT INTO sales (customer_id, cashier_id, subtotal, discount, tax, total_amount, payment_method, notes, is_round_off, invoice_number, invoice_date, invoice_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [customer_id || null, req.user.id, subtotal, totalDiscount, finalTax, totalAmount, payment_method, notes, is_round_off, invoiceNumber, localDate, localTime]
    );
    const sale = saleResult.rows[0];

    // Insert sale items and deduct stock
    for (const item of items) {
      const itemProportionalDiscount = subtotal > 0 ? (totalDiscount * (item._itemSubtotal / subtotal)) : 0;
      const itemFinalPrice = item._itemSubtotal - itemProportionalDiscount + item._itemTax;

      await client.query(
        `INSERT INTO sale_items (sale_id, book_id, book_title, book_author, quantity, unit_price, subtotal, discount_applied, tax_amount, final_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [sale.id, item.book_id, item._book.title, item._book.author,
         item.quantity, item._unitPrice, item._itemSubtotal,
         itemProportionalDiscount, item._itemTax, itemFinalPrice]
      );

      await client.query(
        'UPDATE books SET stock_qty = stock_qty - $1, updated_at = NOW() WHERE id = $2',
        [item.quantity, item.book_id]
      );
    }

    // Update customer stats
    if (customer_id) {
      await client.query(
        `UPDATE customers SET
          total_purchases = total_purchases + 1,
          total_spent = total_spent + $1,
          updated_at = NOW()
         WHERE id = $2`,
        [totalAmount, customer_id]
      );
    }

    await client.query('COMMIT');

    // Fetch full sale with items
    const fullSale = await getSaleById({ params: { id: sale.id } }, null, null, client);
    res.status(201).json(fullSale);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};


const getSales = async (req, res, next) => {
  try {
    const { start_date, end_date, payment_method, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const values = [];
    let whereClause = 'WHERE 1=1';

    if (start_date) {
      values.push(start_date);
      whereClause += ` AND s.created_at >= $${values.length}`;
    }
    if (end_date) {
      values.push(end_date + ' 23:59:59');
      whereClause += ` AND s.created_at <= $${values.length}`;
    }
    if (payment_method) {
      values.push(payment_method);
      whereClause += ` AND s.payment_method = $${values.length}`;
    }

    const result = await pool.query(
      `SELECT s.*, c.name as customer_name, u.username as cashier_name,
              COUNT(si.id) as item_count
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN users u ON s.cashier_id = u.id
       LEFT JOIN sale_items si ON s.id = si.sale_id
       ${whereClause}
       GROUP BY s.id, c.name, u.username
       ORDER BY s.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT s.id), SUM(s.total_amount) as total_revenue
       FROM sales s ${whereClause}`,
      values
    );

    res.json({
      sales: result.rows,
      total: parseInt(countResult.rows[0].count),
      total_revenue: parseFloat(countResult.rows[0].total_revenue || 0),
      page: parseInt(page),
    });
  } catch (error) {
    next(error);
  }
};

const getSaleByIdHandler = async (req, res, next) => {
  try {
    const sale = await getSaleById(req, res, next);
    res.json(sale);
  } catch (error) {
    next(error);
  }
};

const getSaleById = async (req, res, next, client = pool) => {
  const saleResult = await client.query(
    `SELECT s.*, c.name as customer_name, c.phone as customer_phone,
            u.username as cashier_name
     FROM sales s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN users u ON s.cashier_id = u.id
     WHERE s.id = $1`,
    [req.params.id]
  );

  if (saleResult.rows.length === 0) {
    const err = new Error('Sale not found.');
    err.status = 404;
    throw err;
  }

  const itemsResult = await client.query(
    `SELECT si.*, b.cover_image_url FROM sale_items si
     LEFT JOIN books b ON si.book_id = b.id
     WHERE si.sale_id = $1`,
    [req.params.id]
  );

  return { ...saleResult.rows[0], items: itemsResult.rows };
};

module.exports = { createSale, getSales, getSaleByIdHandler };
