const pool = require('../config/db');
const { suggestCategory } = require('../services/categoryHeuristics');
const fs = require('fs');
const path = require('path');

const AUDIT_REPORT_PATH = path.join(__dirname, '../../last_audit_report.json');

function calculateDefaultPrice(categoryName, pageCount) {
  const ranges = {
    "Children's Picture Books": { min: 99, max: 199, pMin: 20, pMax: 80 },
    "Children's Story Books": { min: 149, max: 299, pMin: 30, pMax: 150 },
    "Early Readers": { min: 149, max: 249, pMin: 20, pMax: 100 },
    "Educational": { min: 199, max: 499, pMin: 100, pMax: 600 },
    "Fiction": { min: 249, max: 599, pMin: 150, pMax: 500 },
    "Non-Fiction": { min: 299, max: 699, pMin: 150, pMax: 600 },
    "Science & Technology": { min: 299, max: 999, pMin: 150, pMax: 800 },
    "History": { min: 249, max: 799, pMin: 150, pMax: 600 },
    "Manga": { min: 399, max: 999, pMin: 100, pMax: 300 },
    "Children's Fiction": { min: 199, max: 399, pMin: 80, pMax: 300 },
    "Geography & Travel": { min: 249, max: 699, pMin: 100, pMax: 500 },
    "Animals & Nature": { min: 199, max: 499, pMin: 50, pMax: 400 },
    "Classics": { min: 199, max: 499, pMin: 100, pMax: 600 }
  };

  const catKey = Object.keys(ranges).find(k => k.toLowerCase() === (categoryName || '').toLowerCase());
  const r = ranges[catKey] || { min: 199, max: 499, pMin: 50, pMax: 500 };

  const pages = parseInt(pageCount) || 0;
  if (pages <= 0) {
    return Math.round((r.min + r.max) / 2);
  }

  const pct = (pages - r.pMin) / (r.pMax - r.pMin);
  let price = r.min + pct * (r.max - r.min);
  price = Math.max(r.min, Math.min(r.max, price));
  return Math.round(price * 100) / 100;
}

function calculateDefaultTaxRate(categoryName, format, tags) {
  const cat = (categoryName || '').toLowerCase();
  const t = (tags || '').toLowerCase();
  const isEducational = cat.includes('educational') || cat.includes('academic') || cat.includes('science & technology') || t.includes('educational') || t.includes('textbook') || t.includes('study');

  if (isEducational) {
    return 0.00;
  }
  if (format === 'Digital' || t.includes('ebook') || t.includes('digital') || t.includes('pdf')) {
    return 5.00;
  }
  return 0.00;
}

function resolvePricingAndTaxRate({ price, tax_rate, price_type, format, page_count, tags, categoryName }) {
  const isFree = price_type === 'Free';
  let finalPriceType = price_type || 'Premium';
  let resolvedPrice = price !== undefined && price !== '' && price !== null ? parseFloat(price) : null;
  let resolvedTax = tax_rate !== undefined && tax_rate !== '' && tax_rate !== null ? parseFloat(tax_rate) : null;

  if (isFree) {
    resolvedPrice = 0.00;
    resolvedTax = 0.00;
    finalPriceType = 'Free';
  } else {
    finalPriceType = 'Premium';
    if (resolvedPrice === null || isNaN(resolvedPrice) || resolvedPrice <= 0) {
      resolvedPrice = calculateDefaultPrice(categoryName, page_count);
    }
    const defaultTax = calculateDefaultTaxRate(categoryName, format, tags);
    if (resolvedTax === null || isNaN(resolvedTax)) {
      resolvedTax = defaultTax;
    } else if (resolvedTax === 0 && defaultTax > 0) {
      resolvedTax = defaultTax;
    }
  }
  return { resolvedPrice, resolvedTax, finalPriceType };
}

const runCatalogAudit = async (req, res, next) => {
  console.log('📬 [Audit Controller] Received catalog audit request.');
  
  try {
    console.log('🔍 [Audit Controller] Testing PostgreSQL database connection...');
    await pool.query('SELECT 1');
    console.log('✅ [Audit Controller] Database connection test successful.');
  } catch (dbErr) {
    console.error('❌ [Audit Controller] Database connection test failed:', dbErr.message);
    return res.status(500).json({
      success: false,
      message: 'Database connection failed. Please ensure the database is running and accessible.',
      error: dbErr.message
    });
  }

  try {
    console.log('📚 [Audit Controller] Querying categories...');
    const categoriesRes = await pool.query('SELECT id, name FROM categories');
    const categories = categoriesRes.rows;
    console.log(`✅ [Audit Controller] Found ${categories.length} categories.`);

    console.log('📚 [Audit Controller] Querying active books...');
    const booksRes = await pool.query(
      `SELECT b.*, c.name as category_name
       FROM books b
       LEFT JOIN categories c ON b.category_id = c.id
       WHERE b.is_active = true`
    );
    const books = booksRes.rows;
    console.log(`✅ [Audit Controller] Found ${books.length} active books.`);

    // 1. Identify duplicates
    console.log('🔍 [Audit Controller] Checking duplicate records...');
    const duplicateIsbnQuery = await pool.query(`
      SELECT isbn, COUNT(*) as cnt
      FROM books
      WHERE is_active = true AND isbn IS NOT NULL AND isbn != ''
      GROUP BY isbn
      HAVING COUNT(*) > 1
    `);
    const duplicateIsbns = new Set(duplicateIsbnQuery.rows.map(r => r.isbn));

    const duplicateTitleQuery = await pool.query(`
      SELECT LOWER(TRIM(title)) as t, LOWER(TRIM(author)) as a, COUNT(*) as cnt
      FROM books
      WHERE is_active = true
      GROUP BY LOWER(TRIM(title)), LOWER(TRIM(author))
      HAVING COUNT(*) > 1
    `);
    const duplicateTitles = new Set(duplicateTitleQuery.rows.map(r => `${r.t}|||${r.a}`));

    const updatedPrices = [];
    const updatedTaxes = [];
    const missingDataWarnings = [];
    const duplicateWarnings = [];
    const incorrectCategoryWarnings = [];
    const missingIsbnWarnings = [];
    const missingCoverImageWarnings = [];
    const inventoryInconsistencies = [];
    
    let totalUpdated = 0;
    let healthyBooksCount = 0;

    for (const book of books) {
      const originalPrice = parseFloat(book.price);
      const originalTax = parseFloat(book.tax_rate);
      let format = book.format || 'Printed';
      let pageCount = book.page_count || 0;

      const { resolvedPrice, resolvedTax, finalPriceType } = resolvePricingAndTaxRate({
        price: book.price,
        tax_rate: book.tax_rate,
        price_type: book.price_type,
        format,
        page_count: pageCount,
        tags: book.tags,
        categoryName: book.category_name
      });

      let hasWarning = false;

      // Duplicate Check
      let isDuplicate = false;
      if (book.isbn && duplicateIsbns.has(book.isbn)) {
        isDuplicate = true;
      }
      const titleAuthorKey = `${(book.title || '').toLowerCase().trim()}|||${(book.author || '').toLowerCase().trim()}`;
      if (duplicateTitles.has(titleAuthorKey)) {
        isDuplicate = true;
      }
      if (isDuplicate) {
        hasWarning = true;
        duplicateWarnings.push({
          id: book.id,
          title: book.title,
          author: book.author,
          isbn: book.isbn
        });
      }

      // Incorrect Category Heuristic Check
      const suggestion = suggestCategory(book, categories);
      if (suggestion && suggestion.categoryId !== book.category_id) {
        hasWarning = true;
        incorrectCategoryWarnings.push({
          id: book.id,
          title: book.title,
          author: book.author,
          isbn: book.isbn,
          description: book.description,
          tags: book.tags,
          currentCategory: book.category_name,
          currentCategoryId: book.category_id,
          suggestedCategory: suggestion.categoryName,
          suggestedCategoryId: suggestion.categoryId,
          confidence: suggestion.confidence,
          status: suggestion.confidence >= 80 ? 'Auto-Correct Ready' : 'Needs Verification'
        });
      }

      // Missing ISBN
      if (!book.isbn || book.isbn.trim() === '') {
        hasWarning = true;
        missingIsbnWarnings.push({
          id: book.id,
          title: book.title,
          author: book.author
        });
      }

      // Missing Cover Image
      const coverUrl = book.front_cover_url || book.cover_image_url;
      const isPlaceholder = !coverUrl || coverUrl.includes('placeholder') || coverUrl.includes('default') || coverUrl === '📖';
      if (isPlaceholder) {
        hasWarning = true;
        missingCoverImageWarnings.push({
          id: book.id,
          title: book.title,
          author: book.author
        });
      }

      // Inventory Stock Issues
      if (book.stock_qty === null || book.stock_qty === undefined || book.stock_qty < 0) {
        hasWarning = true;
        inventoryInconsistencies.push({
          id: book.id,
          title: book.title,
          author: book.author,
          stock_qty: book.stock_qty
        });
      }

      // Missing Essential Info
      const essentialMissing = [];
      if (!book.title || book.title.trim() === '') essentialMissing.push('title');
      if (!book.author || book.author.trim() === '') essentialMissing.push('author');
      if (!book.category_id) essentialMissing.push('category');
      if (resolvedPrice === null || resolvedPrice === undefined || isNaN(resolvedPrice)) essentialMissing.push('price');
      if (resolvedTax === null || resolvedTax === undefined || isNaN(resolvedTax)) essentialMissing.push('tax rate');

      if (essentialMissing.length > 0) {
        hasWarning = true;
        missingDataWarnings.push({
          id: book.id,
          title: book.title,
          author: book.author,
          missingFields: essentialMissing
        });
      }

      if (!hasWarning) {
        healthyBooksCount++;
      }

      // Update price/tax if changed
      const priceChanged = Math.abs(resolvedPrice - originalPrice) > 0.001 || book.price_type !== finalPriceType;
      const taxChanged = Math.abs(resolvedTax - originalTax) > 0.001;

      if (priceChanged || taxChanged) {
        console.log(`📝 [Audit Controller] Auto-correcting prices/taxes for book ID ${book.id} ("${book.title}")`);
        await pool.query(
          `UPDATE books SET 
             price = $1, 
             tax_rate = $2, 
             price_type = $3,
             updated_at = NOW() 
           WHERE id = $4`,
          [resolvedPrice, resolvedTax, finalPriceType, book.id]
        );
        
        if (priceChanged) {
          updatedPrices.push({
            id: book.id,
            title: book.title,
            author: book.author,
            oldPrice: originalPrice,
            newPrice: resolvedPrice,
            priceType: finalPriceType
          });
        }
        if (taxChanged) {
          updatedTaxes.push({
            id: book.id,
            title: book.title,
            author: book.author,
            oldTax: originalTax,
            newTax: resolvedTax
          });
        }
        totalUpdated++;
      }
    }

    const healthScore = books.length > 0 ? Math.round((healthyBooksCount / books.length) * 100) : 100;
    console.log(`📊 [Audit Controller] Scan complete. Total: ${books.length}, Health: ${healthScore}%, Updated: ${totalUpdated}, Warnings: ${incorrectCategoryWarnings.length}`);

    const report = {
      timestamp: new Date().toISOString(),
      stats: {
        totalBooks: books.length,
        totalUpdated,
        updatedPricesCount: updatedPrices.length,
        updatedTaxesCount: updatedTaxes.length,
        missingInfoCount: missingDataWarnings.length,
        healthScore
      },
      updatedPrices,
      updatedTaxes,
      missingInfo: missingDataWarnings,
      missingDataWarnings,
      duplicateWarnings,
      incorrectCategoryWarnings,
      missingIsbnWarnings,
      missingCoverImageWarnings,
      inventoryInconsistencies
    };

    // Save report to file asynchronously
    fs.promises.writeFile(AUDIT_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
      .catch(err => console.error('❌ [Audit Controller] Failed to write report file:', err.message));

    // Return the response according to Requirement 9 & Requirement 11
    res.json({
      success: true,
      totalBooks: books.length,
      healthScore,
      totalFixed: totalUpdated,
      missingInfo: missingDataWarnings.length,
      warnings: incorrectCategoryWarnings,
      
      // Backward-compatible properties:
      stats: report.stats,
      timestamp: report.timestamp,
      incorrectCategoryWarnings,
      missingDataWarnings,
      duplicateWarnings,
      missingIsbnWarnings,
      missingCoverImageWarnings,
      inventoryInconsistencies,
      updatedPrices,
      updatedTaxes
    });

  } catch (error) {
    console.error('❌ [Audit Controller] Unexpected error during audit run:', error);
    res.status(500).json({
      success: false,
      message: 'Audit execution failed. Please verify database integrity.',
      error: error.message
    });
  }
};

module.exports = {
  runCatalogAudit
};
