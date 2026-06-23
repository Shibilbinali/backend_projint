const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

const updateBookCover = async (req, res, next) => {
  console.log(`📬 [Cover API] PATCH /api/books/${req.params.id}/cover requested`);

  if (!req.file) {
    console.warn('⚠️ [Cover API] No file uploaded in request');
    return res.status(400).json({ message: 'No image file uploaded.' });
  }

  const bookId = req.params.id;
  const coverType = req.query.type === 'back' ? 'back' : 'front'; // Defaults to front cover

  try {
    // 1. Check if the book exists
    console.log(`🔍 [Cover API] Checking if book ID ${bookId} exists...`);
    const bookCheck = await pool.query(
      'SELECT id, cover_image_url, front_cover_url, back_cover_url FROM books WHERE id = $1 AND is_active = true',
      [bookId]
    );

    if (bookCheck.rows.length === 0) {
      console.warn(`⚠️ [Cover API] Book ID ${bookId} not found`);
      // Delete the uploaded file if book is not found
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ message: 'Book not found.' });
    }

    const book = bookCheck.rows[0];
    const newFilename = req.file.filename;
    const newUrl = `/uploads/${newFilename}`;
    console.log(`✅ [Cover API] New file uploaded to: ${newUrl}`);

    // 2. Identify the old cover image URL to delete
    let oldUrl = null;
    if (coverType === 'back') {
      oldUrl = book.back_cover_url;
    } else {
      oldUrl = book.front_cover_url || book.cover_image_url;
    }

    // 3. Delete the old image file if it is local and exists
    if (oldUrl && oldUrl.startsWith('/uploads/') && !oldUrl.includes('placeholder')) {
      const oldFilePath = path.join(__dirname, '../../', oldUrl);
      console.log(`🔍 [Cover API] Attempting to delete old file: ${oldFilePath}`);
      
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          console.log(`✅ [Cover API] Deleted old cover file: ${oldUrl}`);
        } else {
          console.log(`ℹ️ [Cover API] Old cover file not found on disk: ${oldUrl}`);
        }
      } catch (err) {
        console.error(`❌ [Cover API] Failed to delete old cover file ${oldUrl}:`, err.message);
      }
    }

    // 4. Update the database record with the new URL
    let updateQuery = '';
    let updateParams = [];

    if (coverType === 'back') {
      updateQuery = `
        UPDATE books 
        SET back_cover_url = $1, updated_at = NOW() 
        WHERE id = $2 
        RETURNING *
      `;
      updateParams = [newUrl, bookId];
    } else {
      updateQuery = `
        UPDATE books 
        SET front_cover_url = $1, cover_image_url = $1, cover_image = $1, updated_at = NOW() 
        WHERE id = $2 
        RETURNING *
      `;
      updateParams = [newUrl, bookId];
    }

    console.log(`📝 [Cover API] Updating database cover URL for book ID ${bookId}...`);
    const updateResult = await pool.query(updateQuery, updateParams);
    const updatedBook = updateResult.rows[0];
    console.log(`✅ [Cover API] Database updated successfully.`);

    // 5. Return JSON response matching Requirements
    return res.json({
      success: true,
      message: 'Cover image updated successfully.',
      url: newUrl,
      book: updatedBook
    });

  } catch (error) {
    console.error('❌ [Cover API] Cover replacement execution failed:', error);
    // Delete the uploaded file in case of database or other errors
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({
      success: false,
      message: 'Cover image replacement failed. Please verify server logs.',
      error: error.message
    });
  }
};

module.exports = {
  updateBookCover
};
