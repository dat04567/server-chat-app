const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const {
   createUserValidation,
   updateUserValidation,
   userIdValidation,
   checkValidation
} = require('../utils/validators');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// @route   GET /api/users
// @desc    Lấy tất cả người dùng
// @access  Admin
router.get('/', authMiddleware, adminMiddleware, userController.getAllUsers);

// @route   GET /api/users/:id
// @desc    Lấy thông tin người dùng theo ID
// @access  Admin hoặc chính người dùng đó
router.get('/:id', authMiddleware, userIdValidation, checkValidation, userController.getUserById);

// @route   POST /api/users
// @desc    Tạo người dùng mới (chỉ admin)
// @access  Admin
router.post('/', authMiddleware, adminMiddleware, createUserValidation, checkValidation, userController.createUser);

// @route   PUT /api/users/:id
// @desc    Cập nhật thông tin người dùng
// @access  Admin hoặc chính người dùng đó
router.put('/:id', authMiddleware, updateUserValidation, checkValidation, userController.updateUser);

// @route   DELETE /api/users/:id
// @desc    Xóa người dùng
// @access  Admin
router.delete('/:id', authMiddleware, adminMiddleware, userIdValidation, checkValidation, userController.deleteUser);

module.exports = router;