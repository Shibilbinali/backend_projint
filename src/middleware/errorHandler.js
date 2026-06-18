const errorHandler = (err, req, res, next) => {
  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = new Date().toISOString();

  console.error(`[${requestId}] Error at ${timestamp}:`, err.message);
  console.error(`[${requestId}] Stack:`, err.stack);

  // PostgreSQL duplicate key
  if (err.code === '23505') {
    return res.status(409).json({ message: 'Record already exists (duplicate value).', field: err.constraint, requestId });
  }
  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({ message: 'Referenced record does not exist.', requestId });
  }
  // PostgreSQL invalid data format
  if (err.code === '22P02') {
    return res.status(400).json({ message: 'Invalid data format.', requestId });
  }

  // Upstream API errors — user-friendly messages
  const status = err.status || err.statusCode || 500;

  if (status === 429) {
    return res.status(429).json({
      message: 'Too many requests. Please wait a moment and try again.',
      requestId,
    });
  }
  if (status === 502) {
    return res.status(502).json({
      message: 'An external service is temporarily unavailable. Please try again shortly.',
      requestId,
    });
  }
  if (status === 503) {
    return res.status(503).json({
      message: 'The service is currently experiencing high demand. Please wait a moment or try again later.',
      requestId,
    });
  }

  res.status(status).json({
    message: err.message || 'Internal server error',
    requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;

