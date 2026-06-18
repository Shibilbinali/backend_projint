const pool = require('../config/db');
const { classifyBook } = require('../services/categoryService');
const path = require('path');
const fs = require('fs');

const VERIFICATION_REPORT_PATH = path.join(__dirname, '../../last_verification_report.json');


/**
 * Endpoint to verify and auto-correct categories of all books
 */
const verifyCategoriesEndpoint = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch all active books with their current category names
    const booksRes = await client.query(`
      SELECT b.*, c.name as current_category_name
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.is_active = true
      ORDER BY b.id ASC
    `);
    const books = booksRes.rows;

    const report = {
      timestamp: new Date().toISOString(),
      totalChecked: books.length,
      moved: [],
      needsReview: [],
      conflicts: [],
      stats: {
        totalChecked: books.length,
        movedCount: 0,
        reviewCount: 0,
        conflictCount: 0
      }
    };

    // 2. Identify duplicate/conflicting book items in database (same ISBN or title+author)
    const duplicateIsbnQuery = await client.query(`
      SELECT isbn, COUNT(*) as cnt
      FROM books
      WHERE is_active = true AND isbn IS NOT NULL AND isbn != ''
      GROUP BY isbn
      HAVING COUNT(*) > 1
    `);
    const duplicateIsbns = new Set(duplicateIsbnQuery.rows.map(r => r.isbn));

    const duplicateTitleQuery = await client.query(`
      SELECT LOWER(TRIM(title)) as t, LOWER(TRIM(author)) as a, COUNT(*) as cnt
      FROM books
      WHERE is_active = true
      GROUP BY LOWER(TRIM(title)), LOWER(TRIM(author))
      HAVING COUNT(*) > 1
    `);
    const duplicateTitles = new Set(duplicateTitleQuery.rows.map(r => `${r.t}|||${r.a}`));

    // 3. Process each book
    for (const book of books) {
      // Check for structural conflicts/duplicates
      let isDuplicate = false;
      if (book.isbn && duplicateIsbns.has(book.isbn)) {
        isDuplicate = true;
      }
      const titleAuthorKey = `${(book.title || '').toLowerCase().trim()}|||${(book.author || '').toLowerCase().trim()}`;
      if (duplicateTitles.has(titleAuthorKey)) {
        isDuplicate = true;
      }

      // Classify the book using our service
      const classification = await classifyBook({
        title: book.title,
        author: book.author,
        description: book.description,
        publisher: book.publisher,
        isbn: book.isbn
      });

      // Get target primary category ID
      const catQuery = await client.query('SELECT id FROM categories WHERE name = $1', [classification.primaryCategoryName]);
      const targetCategoryId = catQuery.rows.length > 0 ? catQuery.rows[0].id : null;

      const categoryChanged = targetCategoryId !== null && targetCategoryId !== book.category_id;

      // Update book properties in DB
      await client.query(`
        UPDATE books
        SET category_id = $1,
            needs_manual_review = $2,
            categorization_confidence = $3,
            categorization_notes = $4,
            updated_at = NOW()
        WHERE id = $5
      `, [
        targetCategoryId || book.category_id,
        classification.needsManualReview,
        classification.confidence,
        classification.notes,
        book.id
      ]);

      // Sync secondary categories
      await client.query('DELETE FROM book_secondary_categories WHERE book_id = $1', [book.id]);
      const secondaryIds = [];
      if (classification.secondaryCategoryNames && classification.secondaryCategoryNames.length > 0) {
        for (const secName of classification.secondaryCategoryNames) {
          const secRes = await client.query('SELECT id FROM categories WHERE name = $1', [secName]);
          if (secRes.rows.length > 0) {
            secondaryIds.push(secRes.rows[0].id);
            await client.query(
              'INSERT INTO book_secondary_categories (book_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [book.id, secRes.rows[0].id]
            );
          }
        }
      }

      // Populate report lists
      const bookDetails = {
        id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        previousCategory: book.current_category_name || 'None',
        newCategory: classification.primaryCategoryName,
        secondaryCategories: classification.secondaryCategoryNames,
        confidence: classification.confidence,
        notes: classification.notes
      };

      if (categoryChanged) {
        report.moved.push(bookDetails);
        report.stats.movedCount++;
      }

      if (classification.needsManualReview) {
        report.needsReview.push(bookDetails);
        report.stats.reviewCount++;
      }

      if (isDuplicate) {
        report.conflicts.push({
          ...bookDetails,
          conflictType: 'Duplicate book record found (duplicate ISBN or Title/Author pair)'
        });
        report.stats.conflictCount++;
      }
    }

    await client.query('COMMIT');

    // Save report to file asynchronously
    fs.promises.writeFile(VERIFICATION_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
      .catch(err => console.error('Failed to save category verification report:', err.message));

    res.json(report);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Get all books currently flagged as needing manual review
 */
const getManualReviewBooks = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT b.*, c.name as category_name, c.color as category_color,
             s.suggested_category_id, s.suggested_secondary_category_ids,
             s.cashier_name as suggestion_cashier_name, s.status as suggestion_status,
             COALESCE(
               json_agg(
                 json_build_object('id', sec_c.id, 'name', sec_c.name, 'color', sec_c.color)
               ) FILTER (WHERE sec_c.id IS NOT NULL),
               '[]'::json
             ) as secondary_categories
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN book_secondary_categories bsc ON b.id = bsc.book_id
      LEFT JOIN categories sec_c ON bsc.category_id = sec_c.id
      LEFT JOIN category_suggestions s ON b.id = s.book_id AND s.status = 'pending'
      WHERE b.is_active = true AND b.needs_manual_review = true
      GROUP BY b.id, c.name, c.color, s.suggested_category_id, s.suggested_secondary_category_ids, s.cashier_name, s.status
      ORDER BY b.title ASC
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Approve category assignment for a single book
 */
const approveBookCategory = async (req, res, next) => {
  const { category_id, secondary_categories } = req.body;
  const bookId = req.params.id;

  if (!category_id) {
    return res.status(400).json({ message: 'Primary category ID is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify book exists
    const checkBook = await client.query('SELECT * FROM books WHERE id = $1 AND is_active = true', [bookId]);
    if (checkBook.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    // Update main category, confidence, and notes
    const updateRes = await client.query(`
      UPDATE books
      SET category_id = $1,
          needs_manual_review = false,
          categorization_confidence = 1.00,
          categorization_notes = 'Manually approved by administrator',
          updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [category_id, bookId]);

    // Update secondary categories
    await client.query('DELETE FROM book_secondary_categories WHERE book_id = $1', [bookId]);
    if (Array.isArray(secondary_categories)) {
      for (const secId of secondary_categories) {
        await client.query(
          'INSERT INTO book_secondary_categories (book_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [bookId, secId]
        );
      }
    }

    // Mark pending suggestion as approved if exists
    await client.query(`
      UPDATE category_suggestions 
      SET status = 'approved', updated_at = NOW() 
      WHERE book_id = $1
    `, [bookId]);

    await client.query('COMMIT');
    res.json(updateRes.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Submit category suggestion for a single book (for cashiers)
 */
const suggestBookCategory = async (req, res, next) => {
  const { category_id, secondary_categories } = req.body;
  const bookId = req.params.id;

  if (!category_id) {
    return res.status(400).json({ message: 'Primary category ID is required.' });
  }

  try {
    // Verify book exists
    const checkBook = await pool.query('SELECT * FROM books WHERE id = $1 AND is_active = true', [bookId]);
    if (checkBook.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    const cashierName = req.user.username;

    await pool.query(`
      INSERT INTO category_suggestions (book_id, suggested_category_id, suggested_secondary_category_ids, cashier_name, status, updated_at)
      VALUES ($1, $2, $3, $4, 'pending', NOW())
      ON CONFLICT (book_id) DO UPDATE SET
        suggested_category_id = EXCLUDED.suggested_category_id,
        suggested_secondary_category_ids = EXCLUDED.suggested_secondary_category_ids,
        cashier_name = EXCLUDED.cashier_name,
        status = 'pending',
        updated_at = NOW()
    `, [bookId, category_id, secondary_categories || [], cashierName]);

    res.json({ message: 'Category suggestion submitted successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject cashier suggestion (for admin only)
 */
const rejectBookCategorySuggestion = async (req, res, next) => {
  const bookId = req.params.id;
  try {
    // Verify book exists
    const checkBook = await pool.query('SELECT * FROM books WHERE id = $1 AND is_active = true', [bookId]);
    if (checkBook.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    await pool.query(`
      UPDATE category_suggestions 
      SET status = 'rejected', updated_at = NOW() 
      WHERE book_id = $1
    `, [bookId]);

    res.json({ message: 'Category suggestion rejected successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get the latest category verification report
 */
const getVerifyCategoriesReport = async (req, res, next) => {
  try {
    if (fs.existsSync(VERIFICATION_REPORT_PATH)) {
      const data = await fs.promises.readFile(VERIFICATION_REPORT_PATH, 'utf8');
      return res.json(JSON.parse(data));
    }
    res.json({
      message: 'No category scan has been run yet.',
      timestamp: null,
      stats: {
        totalChecked: 0,
        movedCount: 0,
        reviewCount: 0,
        conflictCount: 0
      },
      moved: [],
      needsReview: [],
      conflicts: []
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  verifyCategoriesEndpoint,
  getManualReviewBooks,
  approveBookCategory,
  suggestBookCategory,
  rejectBookCategorySuggestion,
  getVerifyCategoriesReport
};
