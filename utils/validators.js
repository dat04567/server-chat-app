const { body, param, validationResult } = require('express-validator');

// Middleware to check validation results
exports.checkValidation = (req, res, next) => {
   const errors = validationResult(req);
   if (!errors.isEmpty()) {
      return res.status(400).json({
         success: false,
         errors: errors.array()
      });
   }
   next();
};

// User creation validation
exports.createUserValidation = [
   body('username')
      .notEmpty().withMessage('Tên người dùng là bắt buộc')
      .isLength({ min: 3 }).withMessage('Tên người dùng phải có ít nhất 3 ký tự'),

   body('password')
      .notEmpty().withMessage('Mật khẩu là bắt buộc')
      .isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự'),

   body('email')
      .notEmpty().withMessage('Email là bắt buộc')
      .isEmail().withMessage('Vui lòng cung cấp email hợp lệ'),

];

// User update validation
exports.updateUserValidation = [
   param('id')
      .notEmpty().withMessage('ID người dùng là bắt buộc'),

   body('username')
      .optional()
      .isLength({ min: 3 }).withMessage('Tên người dùng phải có ít nhất 3 ký tự'),

   body('password')
      .optional()
      .isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự'),

   body('email')
      .optional()
      .isEmail().withMessage('Vui lòng cung cấp email hợp lệ'),

   body('profile.firstName')
      .optional(),

   body('profile.lastName')
      .optional(),

   body('profile.age')
      .optional()
      .isNumeric().withMessage('Tuổi phải là số')
      .isInt({ min: 0 }).withMessage('Tuổi phải là số dương'),
];

// User ID validation for get, update and delete operations
exports.userIdValidation = [
   param('id')
      .notEmpty().withMessage('ID người dùng là bắt buộc'),
];




