const pool = require('../config/db');
const XLSX = require('xlsx');
const { parse: parseCsv } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit-table');

const getCustomers = async (req, res, next) => {
  try {
    const { search, city, startDate, endDate, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const values = [];
    const conditions = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(name ILIKE $${values.length} OR phone ILIKE $${values.length} OR email ILIKE $${values.length})`);
    }

    if (city) {
      values.push(`%${city}%`);
      conditions.push(`address ILIKE $${values.length}`);
    }

    if (startDate) {
      values.push(startDate);
      conditions.push(`created_at >= $${values.length}::timestamp`);
    }

    if (endDate) {
      values.push(`${endDate} 23:59:59`);
      conditions.push(`created_at <= $${values.length}::timestamp`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT * FROM customers 
      ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const result = await pool.query(query, [...values, limit, offset]);

    const countQuery = `SELECT COUNT(*) FROM customers ${whereClause}`;
    const countResult = await pool.query(countQuery, values);

    res.json({
      customers: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
    });
  } catch (error) {
    console.error('[getCustomers] Database error:', error);
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
    console.error('[getCustomerById] Database error:', error);
    next(error);
  }
};

const createCustomer = async (req, res, next) => {
  try {
    const {
      name,
      phone,
      email,
      address,
      notes
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Customer full name is required.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Phone number is required.' });
    }

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email && email.trim() ? email.trim() : null;
    const trimmedAddress = address && address.trim() ? address.trim() : null;
    const trimmedNotes = notes && notes.trim() ? notes.trim() : null;

    // Validate phone number format
    const phoneRegex = /^\+?[0-9\s\-()]{10,15}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      return res.status(400).json({ message: 'Invalid phone number format. Must be between 10 and 15 digits.' });
    }

    // Check for duplicate phone number
    const existing = await pool.query('SELECT id FROM customers WHERE phone = $1', [trimmedPhone]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'A customer with this phone number already exists.' });
    }

    const result = await pool.query(
      'INSERT INTO customers (name, phone, email, address, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [trimmedName, trimmedPhone, trimmedEmail, trimmedAddress, trimmedNotes]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[createCustomer] Database error:', error);
    next(error);
  }
};

const updateCustomer = async (req, res, next) => {
  try {
    const {
      name,
      phone,
      email,
      address,
      notes
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Customer full name is required.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Phone number is required.' });
    }

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email && email.trim() ? email.trim() : null;
    const trimmedAddress = address && address.trim() ? address.trim() : null;
    const trimmedNotes = notes && notes.trim() ? notes.trim() : null;

    // Validate phone number format
    const phoneRegex = /^\+?[0-9\s\-()]{10,15}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      return res.status(400).json({ message: 'Invalid phone number format. Must be between 10 and 15 digits.' });
    }

    // Check for duplicate phone number (exclude current customer)
    const existing = await pool.query(
      'SELECT id FROM customers WHERE phone = $1 AND id != $2',
      [trimmedPhone, req.params.id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'A customer with this phone number already exists.' });
    }

    const result = await pool.query(
      `UPDATE customers SET
        name = $1,
        phone = $2,
        email = $3,
        address = $4,
        notes = $5,
        updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [trimmedName, trimmedPhone, trimmedEmail, trimmedAddress, trimmedNotes, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[updateCustomer] Database error:', error);
    next(error);
  }
};

const deleteCustomer = async (req, res, next) => {
  try {
    await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Customer deleted.' });
  } catch (error) {
    console.error('[deleteCustomer] Database error:', error);
    next(error);
  }
};

// ============================================================
// BULK CUSTOMER IMPORT MODULE
// ============================================================

const REQUIRED_CUSTOMER_COLUMNS = [
  'customer_name', 'phone', 'email', 'address', 'notes'
];

function normaliseCustomerRow(raw, idx) {
  return {
    _row: idx + 2, // 1-indexed, header=1
    customer_name: String(raw.customer_name || raw['Customer Name'] || raw['name'] || raw['Name'] || '').trim(),
    phone: String(raw.phone || raw['Phone'] || raw['Phone Number'] || '').replace(/\D/g, '').trim(), // only digits
    email: String(raw.email || raw['Email'] || '').trim(),
    address: String(raw.address || raw['Address'] || '').trim(),
    notes: String(raw.notes || raw['Notes'] || '').trim()
  };
}

function validateCustomerRow(row) {
  const errs = [];
  if (!row.customer_name) {
    errs.push('Customer Name is required');
  }
  if (!row.phone) {
    errs.push('Phone is required');
  } else if (!/^\d{10}$/.test(row.phone)) {
    errs.push('Phone must be exactly 10 digits');
  }
  if (row.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(row.email)) {
      errs.push('Invalid email format');
    }
  }
  return errs;
}

const downloadCustomerTemplate = (req, res) => {
  const format = req.query.format || 'csv';
  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    const data = [
      REQUIRED_CUSTOMER_COLUMNS,
      ['Rahul Kumar', '9876543210', 'rahul@gmail.com', 'Kochi', 'Premium customer'],
      ['Anjali Nair', '9876543211', 'anjali@gmail.com', 'Calicut', 'Teacher'],
      ['Arjun Das', '9876543212', 'arjun@gmail.com', 'Palakkad', 'Frequent buyer']
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Customers Template');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', 'attachment; filename="customers_import_template.xlsx"');
    return res.send(buf);
  }

  // CSV
  const sample = [
    REQUIRED_CUSTOMER_COLUMNS.join(','),
    'Rahul Kumar,9876543210,rahul@gmail.com,Kochi,Premium customer',
    'Anjali Nair,9876543211,anjali@gmail.com,Calicut,Teacher',
    'Arjun Das,9876543212,arjun@gmail.com,Palakkad,Frequent buyer'
  ].join('\n');

  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="customers_import_template.csv"');
  res.send(sample);
};

const getCustomerImportHistory = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cis.*, u.username as imported_by_name
       FROM customer_import_sessions cis
       LEFT JOIN users u ON cis.imported_by = u.id
       ORDER BY cis.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const getCustomerImportSessionStatus = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cis.*, u.username as imported_by_name
       FROM customer_import_sessions cis
       LEFT JOIN users u ON cis.imported_by = u.id
       WHERE cis.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Import session not found.' });
    }
    
    const session = result.rows[0];
    
    // If completed, fetch report info
    if (session.status === 'completed') {
      const reportRes = await pool.query(
        `SELECT id as report_id, pdf_path FROM customer_import_reports WHERE file_name = $1 ORDER BY created_at DESC LIMIT 1`,
        [session.file_name]
      );
      if (reportRes.rows.length > 0) {
        session.report_id = reportRes.rows[0].report_id;
        session.pdf_path = reportRes.rows[0].pdf_path;
      }
    }
    
    res.json(session);
  } catch (err) {
    next(err);
  }
};

const getImportReports = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT cir.*, u.username as imported_by_name
       FROM customer_import_reports cir
       LEFT JOIN users u ON cir.imported_by = u.id
       ORDER BY cir.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const downloadImportReport = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT pdf_path FROM customer_import_reports WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0 || !result.rows[0].pdf_path) {
      return res.status(404).json({ message: 'Report not found.' });
    }
    const pdfPath = path.join(__dirname, '../../', result.rows[0].pdf_path);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ message: 'Report file not found.' });
    }
    res.download(pdfPath);
  } catch (err) {
    next(err);
  }
};

async function runBackgroundCustomerImport(sessionId, rows, duplicateMode) {
  const BATCH_SIZE = 500;
  let successCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const txClient = await pool.connect();
    
    try {
      await txClient.query('BEGIN');
      
      for (const row of chunk) {
        try {
          const existingRes = await txClient.query(
            'SELECT id FROM customers WHERE phone = $1 LIMIT 1',
            [row.phone]
          );
          
          if (existingRes.rows.length > 0) {
            const existingId = existingRes.rows[0].id;
            if (duplicateMode === 'skip') {
              skippedCount++;
              continue;
            } else if (duplicateMode === 'update') {
              await txClient.query(
                `UPDATE customers SET
                  name = $1,
                  email = $2,
                  address = $3,
                  notes = $4,
                  updated_at = NOW()
                 WHERE id = $5`,
                [row.customer_name, row.email || null, row.address || null, row.notes || null, existingId]
              );
              updatedCount++;
              continue;
            }
          }

          await txClient.query(
            `INSERT INTO customers (name, phone, email, address, notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [row.customer_name, row.phone, row.email || null, row.address || null, row.notes || null]
          );
          successCount++;
        } catch (rowErr) {
          failedCount++;
          errors.push({
            row: row._row,
            name: row.customer_name,
            phone: row.phone,
            error: rowErr.message
          });
        }
      }
      
      await txClient.query('COMMIT');
    } catch (batchErr) {
      await txClient.query('ROLLBACK');
      console.error(`Batch starting at index ${i} failed. Retrying rows one-by-one to salvage successful insertions...`);
      
      for (const row of chunk) {
        const singleClient = await pool.connect();
        try {
          await singleClient.query('BEGIN');
          
          const existingRes = await singleClient.query(
            'SELECT id FROM customers WHERE phone = $1 LIMIT 1',
            [row.phone]
          );
          
          if (existingRes.rows.length > 0) {
            const existingId = existingRes.rows[0].id;
            if (duplicateMode === 'skip') {
              skippedCount++;
              await singleClient.query('COMMIT');
              continue;
            } else if (duplicateMode === 'update') {
              await singleClient.query(
                `UPDATE customers SET
                  name = $1,
                  email = $2,
                  address = $3,
                  notes = $4,
                  updated_at = NOW()
                 WHERE id = $5`,
                [row.customer_name, row.email || null, row.address || null, row.notes || null, existingId]
              );
              updatedCount++;
              await singleClient.query('COMMIT');
              continue;
            }
          }

          await singleClient.query(
            `INSERT INTO customers (name, phone, email, address, notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [row.customer_name, row.phone, row.email || null, row.address || null, row.notes || null]
          );
          successCount++;
          await singleClient.query('COMMIT');
        } catch (singleRowErr) {
          await singleClient.query('ROLLBACK');
          failedCount++;
          errors.push({
            row: row._row,
            name: row.customer_name,
            phone: row.phone,
            error: singleRowErr.message
          });
        } finally {
          singleClient.release();
        }
      }
    } finally {
      txClient.release();
    }

    await pool.query(
      `UPDATE customer_import_sessions SET
        success_count = $1, updated_count = $2, skipped_count = $3, failed_count = $4, errors = $5
       WHERE id = $6`,
      [successCount, updatedCount, skippedCount, failedCount, JSON.stringify(errors), sessionId]
    );
  }

  const sessionRes = await pool.query(
    `UPDATE customer_import_sessions SET
      status = 'completed', completed_at = NOW(),
      success_count = $1, updated_count = $2, skipped_count = $3, failed_count = $4, errors = $5
     WHERE id = $6 RETURNING *`,
    [successCount, updatedCount, skippedCount, failedCount, JSON.stringify(errors), sessionId]
  );
  
  const sessionInfo = sessionRes.rows[0];

  try {
    // Generate PDF Report
    const userRes = await pool.query('SELECT username FROM users WHERE id = $1', [sessionInfo.imported_by]);
    const importedByName = userRes.rows.length > 0 ? userRes.rows[0].username : 'System';
    
    // Fetch imported/updated customers from DB
    const phones = rows.map(r => r.phone).filter(Boolean);
    const customersRes = await pool.query('SELECT * FROM customers WHERE phone = ANY($1)', [phones]);
    const dbCustomers = customersRes.rows;

    const reportsDir = path.join(__dirname, '../../uploads/reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const pdfFileName = `customer_import_${sessionId}_${Date.now()}.pdf`;
    const pdfPath = path.join(reportsDir, pdfFileName);

    await new Promise(async (resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const writeStream = fs.createWriteStream(pdfPath);
      doc.pipe(writeStream);

      // Logo placeholder (Book icon SVG path)
      doc.save();
      doc.translate(40, 40).scale(1.5);
      doc.path('M4 19C4 20.1046 4.89543 21 6 21H19.5C19.7761 21 20 20.7761 20 20.5C20 20.2239 19.7761 20 19.5 20H6C5.44772 20 5 19.5523 5 19C5 18.4477 5.44772 18 6 18H19C19.5523 18 20 17.5523 20 17V4C20 2.89543 19.1046 2 18 2H6C4.89543 2 4 2.89543 4 4V19Z').fill('#4F46E5');
      doc.restore();

      // Title
      doc.fontSize(22).font('Helvetica-Bold').fillColor('#111827').text('BookStore POS', 80, 42);
      doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('Customer Import Report', 80, 68);
      
      // Line break
      doc.moveTo(40, 95).lineTo(555, 95).strokeColor('#E5E7EB').stroke();

      // Summary
      doc.y = 110;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151').text('Import Details:', 40, doc.y);
      doc.moveDown(0.5);
      
      doc.font('Helvetica').fontSize(10).fillColor('#4B5563');
      doc.text(`Import Date: ${new Date().toLocaleString()}`);
      doc.text(`Imported By: ${importedByName}`);
      doc.text(`Total Customers Imported: ${successCount + updatedCount}`);
      doc.text(`Failed Records: ${failedCount}`);
      doc.text(`Duplicate Records (Skipped): ${skippedCount}`);
      doc.moveDown(1.5);

      // Table
      const tableArray = {
        title: "Imported Customers Data",
        headers: ["Customer Name", "Phone", "Email", "Address", "Notes", "Joined Date"],
        rows: dbCustomers.map(c => [
          c.name,
          c.phone,
          c.email || '—',
          c.address || '—',
          c.notes || '—',
          new Date(c.created_at).toLocaleDateString()
        ])
      };

      try {
        await doc.table(tableArray, { 
          prepareHeader: () => doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151'),
          prepareRow: (row, i) => doc.font('Helvetica').fontSize(9).fillColor('#4B5563'),
          padding: 5
        });

        // Add page numbers
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(9).fillColor('#9CA3AF').text(
            `Page ${i + 1} of ${range.count}`,
            0,
            doc.page.height - 30,
            { align: 'center', width: doc.page.width }
          );
        }

        doc.end();
      } catch (err) {
        reject(err);
      }

      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const relativePath = `/uploads/reports/${pdfFileName}`;
    await pool.query(
      `INSERT INTO customer_import_reports (file_name, imported_by, total_records, failed_records, duplicate_records, pdf_path)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionInfo.file_name, sessionInfo.imported_by, successCount + updatedCount, failedCount, skippedCount, relativePath]
    );

  } catch (pdfErr) {
    console.error('Failed to generate PDF report:', pdfErr);
  }
}

const importCustomers = async (req, res, next) => {
  try {
    const isPreview = req.query.preview === 'true';
    const duplicateMode = req.query.duplicateMode || 'skip';

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    let rawRows;
    try {
      if (/\.xlsx?$/i.test(req.file.originalname)) {
        const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rawRows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
      } else {
        rawRows = parseCsv(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
      }
    } catch (parseErr) {
      return res.status(400).json({ message: `Failed to parse file: ${parseErr.message}` });
    }

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ message: 'Uploaded file contains no rows.' });
    }

    const fileHeaders = Object.keys(rawRows[0]).map(h => h.toLowerCase().trim());
    const missingHeaders = ['customer_name', 'phone'].filter(h => !fileHeaders.includes(h));
    if (missingHeaders.length > 0) {
      return res.status(400).json({ message: `Missing required CSV column(s): ${missingHeaders.join(', ')}` });
    }

    const normalisedRows = rawRows.map((r, i) => normaliseCustomerRow(r, i));
    const errors = [];
    normalisedRows.forEach(row => {
      const rowErrors = validateCustomerRow(row);
      if (rowErrors.length > 0) {
        errors.push({
          row: row._row,
          name: row.customer_name,
          phone: row.phone,
          errors: rowErrors
        });
      }
    });

    const existingPhoneQuery = await pool.query(
      "SELECT phone FROM customers WHERE phone IS NOT NULL AND phone != ''"
    );
    const existingPhones = new Set(existingPhoneQuery.rows.map(r => r.phone.replace(/\D/g, '').trim()));
    let duplicatePhoneCount = 0;
    const seenInFile = new Set();
    
    normalisedRows.forEach(row => {
      if (row.phone) {
        if (existingPhones.has(row.phone) || seenInFile.has(row.phone)) {
          duplicatePhoneCount++;
        }
        seenInFile.add(row.phone);
      }
    });

    if (isPreview) {
      return res.json({
        preview: normalisedRows.slice(0, 50),
        total_rows: normalisedRows.length,
        valid_rows: normalisedRows.length - errors.length,
        invalid_rows: errors.length,
        duplicate_phone_count: duplicatePhoneCount,
        errors: errors
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        message: 'Cannot import file. Please fix all validation errors first.',
        errors
      });
    }

    const sessionRes = await pool.query(
      `INSERT INTO customer_import_sessions (imported_by, file_name, total_rows, success_count, status)
       VALUES ($1, $2, $3, 0, 'processing') RETURNING id`,
      [req.user.id, req.file.originalname, normalisedRows.length]
    );
    const sessionId = sessionRes.rows[0].id;

    runBackgroundCustomerImport(sessionId, normalisedRows, duplicateMode)
      .catch(bgErr => {
        console.error(`Background customer import job failed for session ${sessionId}:`, bgErr.message);
        pool.query(
          `UPDATE customer_import_sessions SET status = 'failed', errors = JSONB_INSERT(errors, '{0}', $1) WHERE id = $2`,
          [JSON.stringify({ error: bgErr.message }), sessionId]
        ).catch(() => {});
      });

    res.json({
      success: true,
      message: 'Customer import process successfully started in the background.',
      session_id: sessionId
    });
  } catch (err) {
    next(err);
  }
};

const exportCustomers = async (req, res, next) => {
  try {
    const { search, city, startDate, endDate, format = 'csv' } = req.query;
    const values = [];
    const conditions = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(name ILIKE $${values.length} OR phone ILIKE $${values.length} OR email ILIKE $${values.length})`);
    }

    if (city) {
      values.push(`%${city}%`);
      conditions.push(`address ILIKE $${values.length}`);
    }

    if (startDate) {
      values.push(startDate);
      conditions.push(`created_at >= $${values.length}::timestamp`);
    }

    if (endDate) {
      values.push(`${endDate} 23:59:59`);
      conditions.push(`created_at <= $${values.length}::timestamp`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT name, phone, email, address, notes, total_purchases, total_spent, created_at FROM customers ${whereClause} ORDER BY created_at DESC`;
    const result = await pool.query(query, values);

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.rows.map(r => ({
        'Name': r.name,
        'Phone': r.phone,
        'Email': r.email || '',
        'Address': r.address || '',
        'Notes': r.notes || '',
        'Total Purchases': r.total_purchases,
        'Total Spent': parseFloat(r.total_spent),
        'Registration Date': r.created_at
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'Customers');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', 'attachment; filename="customers_export.xlsx"');
      return res.send(buf);
    }

    // CSV Format
    const csvHeaders = ['Name', 'Phone', 'Email', 'Address', 'Notes', 'Total Purchases', 'Total Spent', 'Registration Date'].join(',');
    const csvRows = result.rows.map(r => {
      const fields = [
        `"${String(r.name).replace(/"/g, '""')}"`,
        `"${String(r.phone).replace(/"/g, '""')}"`,
        `"${String(r.email || '').replace(/"/g, '""')}"`,
        `"${String(r.address || '').replace(/"/g, '""')}"`,
        `"${String(r.notes || '').replace(/"/g, '""')}"`,
        r.total_purchases,
        parseFloat(r.total_spent),
        `"${new Date(r.created_at).toISOString()}"`
      ];
      return fields.join(',');
    });
    const csvContent = [csvHeaders, ...csvRows].join('\n');

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="customers_export.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('[exportCustomers] Error:', error);
    next(error);
  }
};

module.exports = {
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
};
