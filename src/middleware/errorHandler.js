const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'File size exceeds the allowed limit (10MB)',
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: 'Unexpected file field',
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }

  // Google Gemini AI errors
  if (err.message && err.message.includes('GoogleGenerativeAI')) {
    // Rate limit / quota exceeded
    if (err.message.includes('429') || err.message.includes('quota') || err.message.includes('Too Many Requests')) {
      return res.status(503).json({
        success: false,
        error: 'AI service is temporarily busy. Please try again in a few moments.',
        code: 'AI_RATE_LIMIT',
      });
    }
    // Model not found
    if (err.message.includes('404') || err.message.includes('not found')) {
      return res.status(503).json({
        success: false,
        error: 'AI service configuration error. Please try again.',
        code: 'AI_MODEL_ERROR',
      });
    }
    // Generic AI error
    return res.status(503).json({
      success: false,
      error: 'AI service temporarily unavailable. Your request will be processed with basic settings.',
      code: 'AI_SERVICE_ERROR',
    });
  }

  // Custom errors with status code
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // Default error
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  });
};

export default errorHandler;
