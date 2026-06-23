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
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.message === 'ALL_MODELS_EXHAUSTED' || err.message?.includes('CAPACITY_EXHAUSTED')) {
    status = 503;
    message = 'AI Classification is temporarily unavailable due to high server demand across all fallback models. Please try again later or fallback to manual categorization.';
  } else if (err.message === 'MISSING_API_KEY') {
    status = 500;
    message = 'Google Gemini API key is missing. Please contact the administrator to configure it.';
  } else if (err.message === 'INVALID_API_KEY') {
    status = 500;
    message = 'Google Gemini API key is invalid. Please contact the administrator.';
  } else if (status === 429) {
    message = 'Too many requests. Please wait a moment and try again.';
  } else if (status === 502) {
    message = 'An external service is temporarily unavailable. Please try again shortly.';
  } else if (status === 503 && !message.includes('unavailable')) {
    message = 'The service is currently experiencing high demand. Please wait a moment or try again later.';
  }

  res.status(status).json({
    message,
    requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;

