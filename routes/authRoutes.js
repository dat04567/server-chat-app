const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { createUserValidation, checkValidation } = require('../utils/validators');

// @route   POST /api/auth/register
// @desc    Đăng ký tài khoản mới cho người dùng
// @access  Public
router.post('/register', createUserValidation, checkValidation, authController.register);

// @route   POST /api/auth/login
// @desc    Đăng nhập
// @access  Public
router.post('/login', checkValidation, authController.login);

// @route   POST /api/auth/logout
// @desc    Đăng xuất
// @access  Private
router.post('/logout', authController.logout);

// @route   POST /api/auth/refresh-token
// @desc    Làm mới token
// @access  Public
router.post('/refresh-token', authController.refreshToken);

// @route   GET /api/auth/verify-email
// @desc    Xác thực email thông qua URL
// @access  Public
router.get('/verify-email', authController.verifyEmail);

// @route   POST /api/auth/verify
// @desc    Xác thực email
// @access  Public
router.post('/verify', authController.verifyEmail);

// @route   POST /api/auth/resend-verification
// @desc    Gửi lại liên kết xác thực qua email
// @access  Public
router.post('/resend-verification', authController.resendVerificationEmail);

module.exports = router;