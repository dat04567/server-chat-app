const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { handleError } = require('../utils');

// Đọc JWT secret từ biến môi trường hoặc sử dụng giá trị mặc định
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-123456-change-in-production';

/**
 * Middleware xác thực người dùng
 * Kiểm tra token JWT và gắn thông tin người dùng vào request
 */
exports.authMiddleware = async (req, res, next) => {
   try {
      // Lấy token từ header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
         return res.status(401).json({
            success: false,
            error: 'Không có token xác thực. Vui lòng đăng nhập.'
         });
      }

      const token = authHeader.split(' ')[1];

      // Xác thực token
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded || !decoded.id) {
         return res.status(401).json({
            success: false,
            error: 'Token không hợp lệ hoặc đã hết hạn.'
         });
      }

      // Tìm người dùng theo ID
      const user = await User.get(decoded.id);
      if (!user) {
         return res.status(404).json({
            success: false,
            error: 'Không tìm thấy người dùng với token này.'
         });
      }

      // Kiểm tra xem tài khoản đã xác thực email chưa
      if (!user.isVerified) {
         return res.status(403).json({
            success: false,
            error: 'Tài khoản chưa được xác thực email. Vui lòng xác thực email trước khi tiếp tục.'
         });
      }

      // Cập nhật thời gian hoạt động cuối cùng
      await User.update({
         id: user.id,
         lastActive: new Date().toISOString()
      });

      // Thêm thông tin người dùng vào request để các middleware và controller tiếp theo có thể sử dụng
      req.user = {
         id: user.id,
         username: user.username,
         email: user.email,
         role: user.role || 'user', // Mặc định là 'user' nếu không có role
         isVerified: user.isVerified
      };

      next();
   } catch (error) {
      if (error.name === 'JsonWebTokenError') {
         return res.status(401).json({
            success: false,
            error: 'Token không hợp lệ. Vui lòng đăng nhập lại.'
         });
      } else if (error.name === 'TokenExpiredError') {
         return res.status(401).json({
            success: false,
            error: 'Token đã hết hạn. Vui lòng đăng nhập lại.'
         });
      }

      error.statusCode = 500;
      error.message = 'Lỗi xác thực. Vui lòng thử lại sau.';
      handleError(error, req, res);
   }
};

/**
 * Middleware kiểm tra quyền admin
 * Yêu cầu authMiddleware phải được gọi trước
 */
exports.adminMiddleware = (req, res, next) => {
   // Kiểm tra xem req.user có tồn tại không (được thiết lập bởi authMiddleware)
   if (!req.user) {
      return res.status(401).json({
         success: false,
         error: 'Vui lòng đăng nhập để tiếp tục.'
      });
   }

   // Kiểm tra xem người dùng có quyền admin không
   if (req.user.role !== 'admin') {
      return res.status(403).json({
         success: false,
         error: 'Bạn không có quyền thực hiện hành động này. Yêu cầu quyền admin.'
      });
   }

   // Nếu là admin, cho phép tiếp tục
   next();
};