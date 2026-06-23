const pool = require('../config/db');
const { fetchBookMetadata } = require('../services/metadataService');
const { classifyBook } = require('../services/categoryService');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { parse: parseCsv } = require('csv-parse/sync');
const https = require('https');
const http = require('http');
const { URL } = require('url');

async function downloadCoverImage(imgUrl, isbn) {
  if (!imgUrl || typeof imgUrl !== 'string' || !imgUrl.startsWith('http')) {
    throw new Error('Invalid URL');
  }

  const uploadsDir = path.join(__dirname, '../../uploads/books');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Determine file extension
  let ext = 'jpg';
  try {
    const parsedUrl = new URL(imgUrl);
    const pathname = parsedUrl.pathname;
    const matchedExt = pathname.match(/\.(jpg|jpeg|png|gif|webp|bmp)(?:\?.*)?$/i);
    if (matchedExt) {
      ext = matchedExt[1].toLowerCase();
    }
  } catch (e) {
    // Ignore error
  }

  const filename = `${isbn || 'cover'}_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
  const destPath = path.join(uploadsDir, filename);

  const fetchWithRedirects = (currentUrl, redirectCount = 0) => {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) {
        return reject(new Error('Too many redirects'));
      }

      let client;
      try {
        client = currentUrl.startsWith('https') ? https : http;
      } catch (err) {
        return reject(err);
      }
      
      const req = client.get(currentUrl, { timeout: 10000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, currentUrl).href;
          return resolve(fetchWithRedirects(redirectUrl, redirectCount + 1));
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP Status ${res.statusCode}`));
        }

        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve(`/uploads/books/${filename}`);
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  };

  return fetchWithRedirects(imgUrl);
}

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


const getBooks = async (req, res, next) => {
  try {
    const { search, category_id, low_stock, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const values = [];
    let whereClause = 'WHERE b.is_active = true';

    if (search) {
      values.push(`%${search}%`);
      whereClause += ` AND (b.title ILIKE $${values.length} OR b.author ILIKE $${values.length} OR b.isbn ILIKE $${values.length})`;
    }
    if (category_id) {
      values.push(category_id);
      whereClause += ` AND b.category_id = $${values.length}`;
    }
    if (low_stock === 'true') {
      whereClause += ` AND b.stock_qty <= b.low_stock_threshold`;
    }

    const query = `
      SELECT b.*, c.name as category_name, c.color as category_color,
             CASE
               WHEN b.stock_qty = 0 THEN 'out_of_stock'
               WHEN b.stock_qty <= COALESCE(b.low_stock_threshold, 5) THEN 'low_stock'
               ELSE 'in_stock'
             END as stock_status,
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
      ${whereClause}
      GROUP BY b.id, c.name, c.color
      ORDER BY b.created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    values.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) FROM books b ${whereClause}
    `;

    const [booksResult, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, values.slice(0, -2)),
    ]);

    res.json({
      books: booksResult.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit),
    });
  } catch (error) {
    next(error);
  }
};

const getBookById = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.*, c.name as category_name, c.color as category_color,
              CASE
                WHEN b.stock_qty = 0 THEN 'out_of_stock'
                WHEN b.stock_qty <= COALESCE(b.low_stock_threshold, 5) THEN 'low_stock'
                ELSE 'in_stock'
              END as stock_status,
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
       WHERE b.id = $1 AND b.is_active = true
       GROUP BY b.id, c.name, c.color`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

function isPlaceholderCover(url) {
  if (!url) return true;
  const str = url.toLowerCase();
  if (str.includes('cover-not-available.svg')) return true;
  if (/\/uploads\/front_\d+\.svg/.test(str) || /\/uploads\/back_\d+\.svg/.test(str)) return true;
  if (str.includes('placehold.co') || str.includes('placeholder')) return true;
  return false;
}

const createBook = async (req, res, next) => {
  try {
    const {
      title, author, isbn, category_id, price, cost_price,
      stock_qty, low_stock_threshold, cover_image_url,
      publisher, published_year, description,
      front_cover_url, back_cover_url, tax_rate,
      reading_age, price_type, tags, page_count, format
    } = req.body;

    if (!title || !author || !category_id) {
      return res.status(400).json({ message: 'Title, author, and category are required.' });
    }

    let finalFrontCover = front_cover_url || cover_image_url;
    let finalPublisher = publisher;
    let finalPublishedYear = published_year;
    let finalDescription = description;
    let finalCoverSource = req.body.cover_source || 'None';
    let finalEdition = req.body.edition || null;
    let finalPageCount = parseInt(page_count) || 0;
    let finalFormat = format || 'Printed';
    const finalTaxRate = parseFloat(tax_rate) || 0;

    const shouldFetch = !finalFrontCover || isPlaceholderCover(finalFrontCover);

    if (shouldFetch && (isbn || (title && author))) {
      const metadata = await fetchBookMetadata(isbn, title, author, publisher);
      
      if (metadata.cover_source !== 'None' || !finalFrontCover || isPlaceholderCover(finalFrontCover)) {
        finalFrontCover = metadata.front_cover_url;
        finalCoverSource = metadata.cover_source;
      }
      
      finalPublisher = publisher || metadata.publisher;
      finalPublishedYear = published_year || metadata.published_year;
      finalDescription = description || metadata.description;
      finalEdition = req.body.edition || metadata.edition;
      if (metadata.page_count && !finalPageCount) {
        finalPageCount = metadata.page_count;
      }
    }

    // Run category auto-classification
    const classification = await classifyBook({
      title,
      author,
      description: finalDescription,
      publisher: finalPublisher,
      isbn
    });

    const catQuery = await pool.query('SELECT name FROM categories WHERE id = $1', [category_id]);
    if (catQuery.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid category ID.' });
    }
    const categoryName = catQuery.rows[0].name;

    const { resolvedPrice, resolvedTax, finalPriceType } = resolvePricingAndTaxRate({
      price,
      tax_rate,
      price_type,
      format: finalFormat,
      page_count: finalPageCount,
      tags,
      categoryName
    });

    if (resolvedPrice === null || isNaN(resolvedPrice) || resolvedTax === null || isNaN(resolvedTax)) {
      return res.status(400).json({ message: 'Valid Price and Tax Rate are required to publish this book.' });
    }

    const result = await pool.query(
      `INSERT INTO books (title, author, isbn, category_id, price, cost_price, stock_qty,
        low_stock_threshold, cover_image_url, publisher, published_year, description,
        front_cover_url, back_cover_url, cover_source, edition, tax_rate,
        needs_manual_review, categorization_confidence, categorization_notes,
        reading_age, price_type, tags, page_count, format)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25) RETURNING *`,
      [title, author, isbn, category_id, resolvedPrice, cost_price || 0,
       stock_qty || 0, low_stock_threshold || 5, finalFrontCover,
       finalPublisher, finalPublishedYear, finalDescription,
       finalFrontCover || null, back_cover_url || null, finalCoverSource, finalEdition,
       resolvedTax, classification.needsManualReview, classification.confidence, classification.notes,
       reading_age || 'All Ages', finalPriceType, tags || '', finalPageCount, finalFormat]
    );

    const newBook = result.rows[0];

    // Insert secondary categories
    if (classification.secondaryCategoryNames && classification.secondaryCategoryNames.length > 0) {
      for (const secName of classification.secondaryCategoryNames) {
        const secCatQuery = await pool.query('SELECT id FROM categories WHERE name = $1', [secName]);
        if (secCatQuery.rows.length > 0) {
          await pool.query(
            'INSERT INTO book_secondary_categories (book_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [newBook.id, secCatQuery.rows[0].id]
          );
        }
      }
    }

    res.status(201).json(newBook);
  } catch (error) {
    next(error);
  }
};

const updateBook = async (req, res, next) => {
  try {
    const bookId = req.params.id;
    const getBookRes = await pool.query('SELECT * FROM books WHERE id = $1 AND is_active = true', [bookId]);
    if (getBookRes.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }
    const existingBook = getBookRes.rows[0];

    const {
      title, author, isbn, category_id, price, cost_price,
      stock_qty, low_stock_threshold, cover_image_url,
      publisher, published_year, description,
      front_cover_url, back_cover_url, cover_source, edition, tax_rate
    } = req.body;

    let finalFrontCover = front_cover_url !== undefined ? front_cover_url : (cover_image_url !== undefined ? cover_image_url : existingBook.front_cover_url);
    let finalPublisher = publisher !== undefined ? publisher : existingBook.publisher;
    let finalPublishedYear = published_year !== undefined ? published_year : existingBook.published_year;
    let finalDescription = description !== undefined ? description : existingBook.description;
    let finalCoverSource = cover_source !== undefined ? cover_source : existingBook.cover_source;
    let finalEdition = edition !== undefined ? edition : existingBook.edition;
    let finalBackCover = back_cover_url !== undefined ? back_cover_url : existingBook.back_cover_url;
    
    const { reading_age, price_type, tags, page_count, format } = req.body;
    let finalReadingAge = reading_age !== undefined ? reading_age : existingBook.reading_age;
    let finalPriceType = price_type !== undefined ? price_type : existingBook.price_type;
    let finalTags = tags !== undefined ? tags : existingBook.tags;
    let finalPageCount = page_count !== undefined ? parseInt(page_count) || 0 : existingBook.page_count || 0;
    let finalFormat = format !== undefined ? format : existingBook.format || 'Printed';

    // Detect changes
    const isbnChanged = isbn !== undefined && isbn !== existingBook.isbn;
    const titleChanged = title !== undefined && title !== existingBook.title;
    const authorChanged = author !== undefined && author !== existingBook.author;

    const isCoverPlaceholder = !finalFrontCover || isPlaceholderCover(finalFrontCover);
    const shouldFetch = isCoverPlaceholder && (isbnChanged || titleChanged || authorChanged);

    if (shouldFetch) {
      const searchIsbn = isbn !== undefined ? isbn : existingBook.isbn;
      const searchTitle = title !== undefined ? title : existingBook.title;
      const searchAuthor = author !== undefined ? author : existingBook.author;
      const searchPublisher = publisher !== undefined ? publisher : existingBook.publisher;

      if (searchIsbn || (searchTitle && searchAuthor)) {
        const metadata = await fetchBookMetadata(searchIsbn, searchTitle, searchAuthor, searchPublisher);
        
        if (metadata.cover_source !== 'None' || isCoverPlaceholder) {
          finalFrontCover = metadata.front_cover_url;
          finalCoverSource = metadata.cover_source;
        }
        if (!finalPublisher) finalPublisher = metadata.publisher;
        if (!finalPublishedYear) finalPublishedYear = metadata.published_year;
        if (!finalDescription) finalDescription = metadata.description;
        if (!finalEdition) finalEdition = metadata.edition;
        if (metadata.page_count && !finalPageCount) {
          finalPageCount = metadata.page_count;
        }
      }
    }

    // Run category auto-classification
    const classification = await classifyBook({
      title: title !== undefined ? title : existingBook.title,
      author: author !== undefined ? author : existingBook.author,
      description: finalDescription,
      publisher: finalPublisher,
      isbn: isbn !== undefined ? isbn : existingBook.isbn
    });

    let finalCategoryId = category_id !== undefined ? category_id : existingBook.category_id;
    if (!finalCategoryId) {
      return res.status(400).json({ message: 'Category is required.' });
    }

    const catQuery = await pool.query('SELECT name FROM categories WHERE id = $1', [finalCategoryId]);
    if (catQuery.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid category ID.' });
    }
    const categoryName = catQuery.rows[0].name;

    const { resolvedPrice, resolvedTax, finalPriceType: updatedPriceType } = resolvePricingAndTaxRate({
      price,
      tax_rate,
      price_type: finalPriceType,
      format: finalFormat,
      page_count: finalPageCount,
      tags: finalTags,
      categoryName
    });
    finalPriceType = updatedPriceType;

    if (resolvedPrice === null || isNaN(resolvedPrice) || resolvedTax === null || isNaN(resolvedTax)) {
      return res.status(400).json({ message: 'Valid Price and Tax Rate are required to publish this book.' });
    }

    let finalNeedsManualReview = classification.needsManualReview;
    let finalConfidence = classification.confidence;
    let finalNotes = classification.notes;

    if (category_id !== undefined && category_id !== '') {
      const proposedCatQuery = await pool.query('SELECT id FROM categories WHERE name = $1', [classification.primaryCategoryName]);
      const proposedCatId = proposedCatQuery.rows.length > 0 ? proposedCatQuery.rows[0].id : null;
      if (parseInt(category_id) !== proposedCatId) {
        finalCategoryId = category_id;
        finalNeedsManualReview = false;
        finalConfidence = 1.0;
        finalNotes = `Manual override by admin (auto-classification proposed: ${classification.primaryCategoryName})`;
      } else {
        finalCategoryId = proposedCatId;
      }
    }

    if (req.body.needs_manual_review !== undefined) {
      finalNeedsManualReview = req.body.needs_manual_review;
    }
    if (req.body.categorization_confidence !== undefined) {
      finalConfidence = req.body.categorization_confidence;
    }
    if (req.body.categorization_notes !== undefined) {
      finalNotes = req.body.categorization_notes;
    }

    const result = await pool.query(
      `UPDATE books SET
        title = COALESCE($1, title),
        author = COALESCE($2, author),
        isbn = COALESCE($3, isbn),
        category_id = COALESCE($4, category_id),
        price = COALESCE($5, price),
        cost_price = COALESCE($6, cost_price),
        stock_qty = COALESCE($7, stock_qty),
        low_stock_threshold = COALESCE($8, low_stock_threshold),
        cover_image_url = $9,
        publisher = $10,
        published_year = $11,
        description = $12,
        front_cover_url = $13,
        back_cover_url = $14,
        cover_source = $15,
        edition = $16,
        tax_rate = $17,
        needs_manual_review = $18,
        categorization_confidence = $19,
        categorization_notes = $20,
        reading_age = $21,
        price_type = $22,
        tags = $23,
        page_count = $24,
        format = $25,
        updated_at = NOW()
       WHERE id = $26 AND is_active = true RETURNING *`,
      [
        title !== undefined ? title : existingBook.title,
        author !== undefined ? author : existingBook.author,
        isbn !== undefined ? isbn : existingBook.isbn,
        finalCategoryId,
        resolvedPrice,
        cost_price !== undefined ? cost_price : existingBook.cost_price,
        stock_qty !== undefined ? stock_qty : existingBook.stock_qty,
        low_stock_threshold !== undefined ? low_stock_threshold : existingBook.low_stock_threshold,
        finalFrontCover || null,
        finalPublisher || null,
        finalPublishedYear || null,
        finalDescription || null,
        finalFrontCover || null,
        finalBackCover || null,
        finalCoverSource || 'None',
        finalEdition || null,
        resolvedTax,
        finalNeedsManualReview,
        finalConfidence,
        finalNotes,
        finalReadingAge,
        finalPriceType,
        finalTags,
        finalPageCount,
        finalFormat,
        bookId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    // Sync secondary categories
    await pool.query('DELETE FROM book_secondary_categories WHERE book_id = $1', [bookId]);
    
    let secondaryCatIds = [];
    if (req.body.secondary_categories !== undefined) {
      secondaryCatIds = req.body.secondary_categories;
    } else {
      if (classification.secondaryCategoryNames && classification.secondaryCategoryNames.length > 0) {
        for (const secName of classification.secondaryCategoryNames) {
          const secCatQuery = await pool.query('SELECT id FROM categories WHERE name = $1', [secName]);
          if (secCatQuery.rows.length > 0) {
            secondaryCatIds.push(secCatQuery.rows[0].id);
          }
        }
      }
    }

    for (const secId of secondaryCatIds) {
      await pool.query(
        'INSERT INTO book_secondary_categories (book_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [bookId, secId]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

const deleteBook = async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE books SET is_active = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }
    res.json({ message: 'Book deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

const fetchMetadataEndpoint = async (req, res, next) => {
  try {
    const { isbn, title, author, publisher } = req.body;
    const metadata = await fetchBookMetadata(isbn, title, author, publisher);
    res.json(metadata);
  } catch (error) {
    next(error);
  }
};

const refreshMetadataEndpoint = async (req, res, next) => {
  try {
    const bookId = req.params.id;
    const getBookRes = await pool.query('SELECT * FROM books WHERE id = $1 AND is_active = true', [bookId]);
    if (getBookRes.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }
    const book = getBookRes.rows[0];
    const metadata = await fetchBookMetadata(book.isbn, book.title, book.author, book.publisher);

    let finalFrontCover = book.front_cover_url;
    let finalCoverSource = book.cover_source;
    
    // Only update front cover if the new cover is not None/empty OR the current cover is a placeholder
    if (metadata.cover_source !== 'None' || !book.front_cover_url || isPlaceholderCover(book.front_cover_url)) {
      finalFrontCover = metadata.front_cover_url;
      finalCoverSource = metadata.cover_source;
    }

    const updateRes = await pool.query(
      `UPDATE books SET
        front_cover_url = $1,
        cover_image_url = $1,
        publisher = COALESCE($2, publisher),
        published_year = COALESCE($3, published_year),
        description = COALESCE($4, description),
        edition = COALESCE($5, edition),
        cover_source = $6,
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [
        finalFrontCover,
        metadata.publisher || book.publisher,
        metadata.published_year || book.published_year,
        metadata.description || book.description,
        metadata.edition || book.edition,
        finalCoverSource,
        bookId
      ]
    );
    res.json(updateRes.rows[0]);
  } catch (error) {
    next(error);
  }
};

const auditBooks = async (req, res, next) => {
  try {
    const booksRes = await pool.query(
      `SELECT b.*, c.name as category_name
       FROM books b
       LEFT JOIN categories c ON b.category_id = c.id
       WHERE b.is_active = true`
    );
    const books = booksRes.rows;

    // 1. Identify duplicate/conflicting book items in database (same ISBN or title+author)
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
    
    // Detailed warnings for Cashier/Admin settings audit view
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

      // Resolve pricing and tax FIRST (before validation uses the values)
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

      // 1. Check duplicate records
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

      // 2. Check incorrect/unverified categories
      if (book.needs_manual_review) {
        hasWarning = true;
        incorrectCategoryWarnings.push({
          id: book.id,
          title: book.title,
          author: book.author,
          confidence: book.categorization_confidence
        });
      }

      // 3. Check missing ISBN
      if (!book.isbn || book.isbn.trim() === '') {
        hasWarning = true;
        missingIsbnWarnings.push({
          id: book.id,
          title: book.title,
          author: book.author
        });
      }

      // 4. Check missing cover image
      const coverUrl = book.front_cover_url || book.cover_image_url;
      if (!coverUrl || isPlaceholderCover(coverUrl)) {
        hasWarning = true;
        missingCoverImageWarnings.push({
          id: book.id,
          title: book.title,
          author: book.author
        });
      }

      // 5. Check inventory inconsistencies
      if (book.stock_qty === null || book.stock_qty === undefined || book.stock_qty < 0) {
        hasWarning = true;
        inventoryInconsistencies.push({
          id: book.id,
          title: book.title,
          author: book.author,
          stock_qty: book.stock_qty
        });
      }

      // 6. Check missing essential data
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

      const priceChanged = Math.abs(resolvedPrice - originalPrice) > 0.001 || book.price_type !== finalPriceType;
      const taxChanged = Math.abs(resolvedTax - originalTax) > 0.001;

      if (priceChanged || taxChanged) {
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
      .catch(err => console.error('Failed to save audit report:', err.message));

    res.json(report);
  } catch (error) {
    next(error);
  }
};

const getAuditReport = async (req, res, next) => {
  try {
    if (fs.existsSync(AUDIT_REPORT_PATH)) {
      const data = await fs.promises.readFile(AUDIT_REPORT_PATH, 'utf8');
      return res.json(JSON.parse(data));
    }
    res.json({
      message: 'No audit has been run yet.',
      timestamp: null,
      stats: null,
      updatedPrices: [],
      updatedTaxes: [],
      missingInfo: []
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// BULK BOOK IMPORT MODULE
// ============================================================

const REQUIRED_BOOK_COLUMNS = [
  'title', 'author', 'isbn', 'category', 'selling_price', 'cost_price',
  'stock_quantity', 'low_stock_alert', 'publisher', 'published_year',
  'edition', 'gst_percentage', 'cover_source', 'price_type', 'format',
  'page_count', 'reading_age', 'category_tags', 'description',
  'front_cover_url', 'back_cover_url', 'cover_image_url'
];

function normaliseBookRow(raw, idx) {
  return {
    _row: idx + 2, // 1-indexed, header=1
    title: String(raw.title || raw['Title'] || '').trim(),
    author: String(raw.author || raw['Author'] || '').trim(),
    isbn: String(raw.isbn || raw['ISBN'] || '').trim(),
    category: String(raw.category || raw['Category'] || '').trim(),
    selling_price: parseFloat(raw.selling_price || raw['selling_price'] || raw['Selling Price'] || '0'),
    cost_price: parseFloat(raw.cost_price || raw['cost_price'] || raw['Cost Price'] || '0'),
    stock_quantity: parseInt(raw.stock_quantity || raw['stock_quantity'] || raw['Stock Quantity'] || '0', 10),
    low_stock_alert: parseInt(raw.low_stock_alert || raw['low_stock_alert'] || raw['Low Stock Alert'] || '5', 10),
    publisher: String(raw.publisher || raw['Publisher'] || '').trim(),
    published_year: raw.published_year || raw['Published Year'] ? parseInt(raw.published_year || raw['Published Year'], 10) : null,
    edition: String(raw.edition || raw['Edition'] || '').trim(),
    gst_percentage: parseFloat(raw.gst_percentage || raw['gst_percentage'] || raw['GST Percentage'] || raw['GST %'] || '0'),
    cover_source: String(raw.cover_source || raw['Cover Source'] || 'None').trim(),
    price_type: String(raw.price_type || raw['Price Type'] || 'Premium').trim(),
    format: String(raw.format || raw['Format'] || 'Printed').trim(),
    page_count: parseInt(raw.page_count || raw['Page Count'] || '0', 10),
    reading_age: String(raw.reading_age || raw['Reading Age'] || 'All Ages').trim(),
    category_tags: String(raw.category_tags || raw['Category Tags'] || raw['tags'] || '').trim(),
    description: String(raw.description || raw['Description'] || '').trim(),
    front_cover_url: String(raw.front_cover_url || raw['Front Cover URL'] || '').trim(),
    back_cover_url: String(raw.back_cover_url || raw['Back Cover URL'] || '').trim(),
    cover_image_url: String(raw.cover_image_url || raw['Cover Image URL'] || raw['cover_image_url'] || '').trim()
  };
}

function validateBookRow(row) {
  const errs = [];
  if (!row.title) errs.push('Title is required');
  if (!row.author) errs.push('Author is required');
  if (!row.category) errs.push('Category is required');
  if (isNaN(row.selling_price) || row.selling_price < 0) errs.push('Selling price must be a non-negative number');
  if (isNaN(row.cost_price) || row.cost_price < 0) errs.push('Cost price must be a non-negative number');
  if (isNaN(row.stock_quantity) || row.stock_quantity < 0) errs.push('Stock quantity must be a non-negative integer');
  if (isNaN(row.low_stock_alert) || row.low_stock_alert < 0) errs.push('Low stock alert must be a non-negative integer');
  if (row.price_type && !['Free', 'Premium'].includes(row.price_type)) errs.push('Price Type must be Free or Premium');
  if (row.format && !['Printed', 'Digital'].includes(row.format)) errs.push('Format must be Printed or Digital');
  if (row.published_year !== null && (isNaN(row.published_year) || row.published_year < 1000 || row.published_year > 2100)) {
    errs.push('Published year must be a valid 4-digit year');
  }
  return errs;
}

const downloadImportTemplate = (req, res) => {
  const format = req.query.format || 'csv';
  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    const data = [
      REQUIRED_BOOK_COLUMNS,
      [
        'The Great Gatsby', 'F. Scott Fitzgerald', '9780743273565', 'Classics', '299.00', '150.00',
        '50', '5', 'Scribner', '1925', 'First', '5', 'None', 'Premium', 'Printed',
        '180', 'All Ages', 'classic, fiction', 'A novel about wealth and love in the 1920s',
        'http://example.com/gatsby_front.jpg', '', 'http://example.com/gatsby_cover.jpg'
      ]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Books Template');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', 'attachment; filename="books_import_template.xlsx"');
    return res.send(buf);
  }

  // CSV
  const sample = [
    REQUIRED_BOOK_COLUMNS.join(','),
    'The Great Gatsby,F. Scott Fitzgerald,9780743273565,Classics,299.00,150.00,50,5,Scribner,1925,First,5,None,Premium,Printed,180,All Ages,"classic, fiction",A novel about wealth and love in the 1920s,http://example.com/gatsby_front.jpg,,http://example.com/gatsby_cover.jpg'
  ].join('\n');

  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="books_import_template.csv"');
  res.send(sample);
};

const getImportHistory = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT bis.*, u.username as imported_by_name
       FROM book_import_sessions bis
       LEFT JOIN users u ON bis.imported_by = u.id
       ORDER BY bis.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const getImportSessionStatus = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT bis.*, u.username as imported_by_name
       FROM book_import_sessions bis
       LEFT JOIN users u ON bis.imported_by = u.id
       WHERE bis.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Import session not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

async function runBackgroundBookImport(sessionId, rows, duplicateMode) {
  const BATCH_SIZE = 500;
  let successCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let coversImportedCount = 0;
  let failedCoversCount = 0;
  const errors = [];

  const categoryCache = new Map();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const txClient = await pool.connect();
    
    try {
      await txClient.query('BEGIN');
      
      for (const row of chunk) {
        try {
          const catNameClean = row.category.trim();
          let catId = categoryCache.get(catNameClean.toLowerCase());
          
          if (!catId) {
            const catRes = await txClient.query(
              'SELECT id FROM categories WHERE LOWER(name) = LOWER($1)',
              [catNameClean]
            );
            if (catRes.rows.length > 0) {
              catId = catRes.rows[0].id;
            } else {
              const insertCatRes = await txClient.query(
                `INSERT INTO categories (name, created_at)
                 VALUES ($1, NOW()) RETURNING id`,
                [catNameClean]
              );
              catId = insertCatRes.rows[0].id;
            }
            categoryCache.set(catNameClean.toLowerCase(), catId);
          }

          let existingBookId = null;
          if (row.isbn) {
            const existingRes = await txClient.query(
              'SELECT id FROM books WHERE isbn = $1 AND is_active = true LIMIT 1',
              [row.isbn]
            );
            if (existingRes.rows.length > 0) {
              existingBookId = existingRes.rows[0].id;
            }
          }

          // Handle cover image downloading
          let localCoverPath = null;
          const coverUrl = row.cover_image_url || row.front_cover_url;
          if (coverUrl && coverUrl.trim().startsWith('http')) {
            try {
              localCoverPath = await downloadCoverImage(coverUrl.trim(), row.isbn);
              coversImportedCount++;
            } catch (dlErr) {
              console.error(`Failed to download cover for ISBN ${row.isbn} from ${coverUrl}: ${dlErr.message}`);
              failedCoversCount++;
              localCoverPath = '/uploads/cover-not-available.svg';
            }
          }

          if (existingBookId) {
            if (duplicateMode === 'skip') {
              skippedCount++;
              continue;
            } else if (duplicateMode === 'update') {
              await txClient.query(
                `UPDATE books SET
                  title = $1, author = $2, category_id = $3, price = $4, cost_price = $5,
                  stock_qty = $6, low_stock_threshold = $7, publisher = $8, published_year = $9,
                  edition = $10, tax_rate = $11, cover_image_url = $12, front_cover_url = $12,
                  back_cover_url = $13, cover_source = $14, reading_age = $15, price_type = $16,
                  tags = $17, page_count = $18, format = $19, description = $20,
                  cover_image = COALESCE($21, cover_image), updated_at = NOW()
                 WHERE id = $22`,
                [
                  row.title, row.author, catId, row.selling_price, row.cost_price,
                  row.stock_quantity, row.low_stock_alert, row.publisher, row.published_year,
                  row.edition, row.gst_percentage, row.cover_image_url || row.front_cover_url || null, row.back_cover_url || null,
                  row.cover_source, row.reading_age, row.price_type, row.category_tags,
                  row.page_count, row.format, row.description, localCoverPath || null, existingBookId
                ]
              );
              updatedCount++;
              continue;
            }
          }

          await txClient.query(
            `INSERT INTO books (
              title, author, isbn, category_id, price, cost_price, stock_qty,
              low_stock_threshold, publisher, published_year, edition, tax_rate,
              cover_image_url, front_cover_url, back_cover_url, cover_source,
              reading_age, price_type, tags, page_count, format, description, cover_image
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
            [
              row.title, row.author, row.isbn || null, catId, row.selling_price, row.cost_price,
              row.stock_quantity, row.low_stock_alert, row.publisher, row.published_year,
              row.edition, row.gst_percentage, row.cover_image_url || row.front_cover_url || null, row.front_cover_url || null, row.back_cover_url || null,
              row.cover_source, row.reading_age, row.price_type, row.category_tags,
              row.page_count, row.format, row.description, localCoverPath || '/uploads/cover-not-available.svg'
            ]
          );
          successCount++;
        } catch (rowErr) {
          failedCount++;
          errors.push({
            row: row._row,
            title: row.title,
            isbn: row.isbn,
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
          
          const catNameClean = row.category.trim();
          let catId = categoryCache.get(catNameClean.toLowerCase());
          
          if (!catId) {
            const catRes = await singleClient.query(
              'SELECT id FROM categories WHERE LOWER(name) = LOWER($1)',
              [catNameClean]
            );
            if (catRes.rows.length > 0) {
              catId = catRes.rows[0].id;
            } else {
              const insertCatRes = await singleClient.query(
                `INSERT INTO categories (name, created_at)
                 VALUES ($1, NOW()) RETURNING id`,
                [catNameClean]
              );
              catId = insertCatRes.rows[0].id;
            }
            categoryCache.set(catNameClean.toLowerCase(), catId);
          }

          let existingBookId = null;
          if (row.isbn) {
            const existingRes = await singleClient.query(
              'SELECT id FROM books WHERE isbn = $1 AND is_active = true LIMIT 1',
              [row.isbn]
            );
            if (existingRes.rows.length > 0) {
              existingBookId = existingRes.rows[0].id;
            }
          }

          // Handle cover image downloading
          let localCoverPath = null;
          const coverUrl = row.cover_image_url || row.front_cover_url;
          if (coverUrl && coverUrl.trim().startsWith('http')) {
            try {
              localCoverPath = await downloadCoverImage(coverUrl.trim(), row.isbn);
              coversImportedCount++;
            } catch (dlErr) {
              console.error(`Failed to download cover for ISBN ${row.isbn} from ${coverUrl}: ${dlErr.message}`);
              failedCoversCount++;
              localCoverPath = '/uploads/cover-not-available.svg';
            }
          }

          if (existingBookId) {
            if (duplicateMode === 'skip') {
              skippedCount++;
              await singleClient.query('COMMIT');
              continue;
            } else if (duplicateMode === 'update') {
              await singleClient.query(
                `UPDATE books SET
                  title = $1, author = $2, category_id = $3, price = $4, cost_price = $5,
                  stock_qty = $6, low_stock_threshold = $7, publisher = $8, published_year = $9,
                  edition = $10, tax_rate = $11, cover_image_url = $12, front_cover_url = $12,
                  back_cover_url = $13, cover_source = $14, reading_age = $15, price_type = $16,
                  tags = $17, page_count = $18, format = $19, description = $20,
                  cover_image = COALESCE($21, cover_image), updated_at = NOW()
                 WHERE id = $22`,
                [
                  row.title, row.author, catId, row.selling_price, row.cost_price,
                  row.stock_quantity, row.low_stock_alert, row.publisher, row.published_year,
                  row.edition, row.gst_percentage, row.cover_image_url || row.front_cover_url || null, row.back_cover_url || null,
                  row.cover_source, row.reading_age, row.price_type, row.category_tags,
                  row.page_count, row.format, row.description, localCoverPath || null, existingBookId
                ]
              );
              updatedCount++;
              await singleClient.query('COMMIT');
              continue;
            }
          }

          await singleClient.query(
            `INSERT INTO books (
              title, author, isbn, category_id, price, cost_price, stock_qty,
              low_stock_threshold, publisher, published_year, edition, tax_rate,
              cover_image_url, front_cover_url, back_cover_url, cover_source,
              reading_age, price_type, tags, page_count, format, description, cover_image
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
            [
              row.title, row.author, row.isbn || null, catId, row.selling_price, row.cost_price,
              row.stock_quantity, row.low_stock_alert, row.publisher, row.published_year,
              row.edition, row.gst_percentage, row.cover_image_url || row.front_cover_url || null, row.front_cover_url || null, row.back_cover_url || null,
              row.cover_source, row.reading_age, row.price_type, row.category_tags,
              row.page_count, row.format, row.description, localCoverPath || '/uploads/cover-not-available.svg'
            ]
          );
          successCount++;
          await singleClient.query('COMMIT');
        } catch (singleRowErr) {
          await singleClient.query('ROLLBACK');
          failedCount++;
          errors.push({
            row: row._row,
            title: row.title,
            isbn: row.isbn,
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
      `UPDATE book_import_sessions SET
        success_count = $1, updated_count = $2, skipped_count = $3, failed_count = $4,
        covers_imported_count = $5, failed_covers_count = $6, errors = $7
       WHERE id = $8`,
      [successCount, updatedCount, skippedCount, failedCount, coversImportedCount, failedCoversCount, JSON.stringify(errors), sessionId]
    );
  }

  await pool.query(
    `UPDATE book_import_sessions SET
      status = 'completed', completed_at = NOW(),
      success_count = $1, updated_count = $2, skipped_count = $3, failed_count = $4,
      covers_imported_count = $5, failed_covers_count = $6, errors = $7
     WHERE id = $8`,
    [successCount, updatedCount, skippedCount, failedCount, coversImportedCount, failedCoversCount, JSON.stringify(errors), sessionId]
  );
}

const importBooks = async (req, res, next) => {
  try {
    const isPreview = req.query.preview === 'true';
    const duplicateMode = req.query.duplicateMode || 'skip'; // skip, update, import_new

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
    const missingHeaders = ['title', 'author', 'category'].filter(h => !fileHeaders.includes(h));
    if (missingHeaders.length > 0) {
      return res.status(400).json({ message: `Missing required CSV column(s): ${missingHeaders.join(', ')}` });
    }

    const normalisedRows = rawRows.map((r, i) => normaliseBookRow(r, i));
    const errors = [];
    normalisedRows.forEach(row => {
      const rowErrors = validateBookRow(row);
      if (rowErrors.length > 0) {
        errors.push({
          row: row._row,
          title: row.title,
          isbn: row.isbn,
          errors: rowErrors
        });
      }
    });

    const existingIsbnQuery = await pool.query(
      "SELECT isbn FROM books WHERE is_active = true AND isbn IS NOT NULL AND isbn != ''"
    );
    const existingIsbns = new Set(existingIsbnQuery.rows.map(r => r.isbn.trim()));
    let duplicateIsbnCount = 0;
    const seenInFile = new Set();
    
    normalisedRows.forEach(row => {
      if (row.isbn) {
        if (existingIsbns.has(row.isbn) || seenInFile.has(row.isbn)) {
          duplicateIsbnCount++;
        }
        seenInFile.add(row.isbn);
      }
    });

    if (isPreview) {
      return res.json({
        preview: normalisedRows.slice(0, 50),
        total_rows: normalisedRows.length,
        valid_rows: normalisedRows.length - errors.length,
        invalid_rows: errors.length,
        duplicate_isbn_count: duplicateIsbnCount,
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
      `INSERT INTO book_import_sessions (imported_by, file_name, total_rows, success_count, status)
       VALUES ($1, $2, $3, 0, 'processing') RETURNING id`,
      [req.user.id, req.file.originalname, normalisedRows.length]
    );
    const sessionId = sessionRes.rows[0].id;

    runBackgroundBookImport(sessionId, normalisedRows, duplicateMode)
      .catch(bgErr => {
        console.error(`Background import job failed for session ${sessionId}:`, bgErr.message);
        pool.query(
          `UPDATE book_import_sessions SET status = 'failed', errors = JSONB_INSERT(errors, '{0}', $1) WHERE id = $2`,
          [JSON.stringify({ error: bgErr.message }), sessionId]
        ).catch(() => {});
      });

    res.json({
      success: true,
      message: 'Import process successfully started in the background.',
      session_id: sessionId
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
  fetchMetadataEndpoint,
  refreshMetadataEndpoint,
  auditBooks,
  getAuditReport,
  downloadImportTemplate,
  getImportHistory,
  getImportSessionStatus,
  importBooks
};
