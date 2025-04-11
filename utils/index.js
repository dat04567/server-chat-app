
exports.formatResponse = (success, data, message = '') => {
   return {
      success,
      data,
      message,
      timestamp: new Date().toISOString()
   };
};


exports.handleError = (error, req, res, next) => {
   const statusCode = error.statusCode || 500;
   res.status(statusCode).json({
      success: false,
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? '🥞' : error.stack
   });
};

// Async function wrapper to avoid try/catch repetition
exports.asyncHandler = (fn) => {
   return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
   };
};