const pool = require('../config/db');

const getCategories = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.*, COUNT(b.id) as book_count
       FROM categories c
       LEFT JOIN books b ON c.id = b.category_id AND b.is_active = true
       GROUP BY c.id
       ORDER BY c.name`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required.' });
    const result = await pool.query(
      'INSERT INTO categories (name, description, color) VALUES ($1, $2, $3) RETURNING *',
      [name, description, color || '#8B4513']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { name, description, color } = req.body;
    const result = await pool.query(
      `UPDATE categories SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        color = COALESCE($3, color)
       WHERE id = $4 RETURNING *`,
      [name, description, color, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Category not found.' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ message: 'Category deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
