const User = require('../models/userModel');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { generateVerificationCode, sendVerificationEmail } = require('../utils/emailService');
const { handleError } = require('../utils');

// Get all users
exports.getAllUsers = async (req, res) => {
   try {
      const users = await User.scan().exec();

      res.status(200).json({
         success: true,
         count: users.length,
         data: users
      });
   } catch (error) {
      error.message = 'Failed to fetch users';
      handleError(error, req, res);
   }
};

// Get single user
exports.getUserById = async (req, res) => {
   try {
      const user = await User.get(req.params.id);

      if (!user) {
         return res.status(404).json({
            success: false,
            error: 'User not found'
         });
      }

      res.status(200).json({
         success: true,
         data: user
      });
   } catch (error) {
      handleError(error, req, res);
   }
};

// Search users by name
exports.searchUsersByName = async (req, res) => {
   try {
      const { name } = req.query;

      // Kiểm tra xem có tham số tìm kiếm không
      if (!name) {
         return res.status(400).json({
            success: false,
            error: 'Vui lòng cung cấp tham số tìm kiếm (name)'
         });
      }

      // Tìm kiếm người dùng có firstName hoặc lastName chứa từ khóa tìm kiếm
      // Tối ưu hóa bằng cách giới hạn số lượng kết quả và chỉ trả về thông tin cần thiết
      const users = await User.scan()
         .where('profile.firstName')
         .contains(name)
         .or()
         .where('profile.lastName')
         .contains(name)
         .attributes(['id', 'username', 'profile', 'status', 'lastSeen']) // Chỉ lấy các trường cần thiết
         .limit(20) // Giới hạn kết quả để tăng hiệu suất
         .exec();

      // Lọc thông tin người dùng (không trả về thông tin nhạy cảm)
      const filteredUsers = users.map(user => ({
         id: user.id,
         username: user.username,
         profile: user.profile,
         status: user.status,
         lastSeen: user.lastSeen
      }));

      res.status(200).json({
         success: true,
         count: filteredUsers.length,
         data: filteredUsers
      });
   } catch (error) {
      error.message = 'Không thể tìm kiếm người dùng';
      handleError(error, req, res);
   }
};

// Create new user (Admin only)
exports.createUser = async (req, res) => {
   try {
      // Kiểm tra nếu người dùng tạo là admin
      if (req.user.role !== 'admin') {
         return res.status(403).json({
            success: false,
            error: 'Không có quyền tạo người dùng'
         });
      }

      // Hash mật khẩu
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(req.body.password, salt);

      // Generate verification code
      const verificationCode = generateVerificationCode();
      // Set expiration time (1 hour from now)
      const verificationExpires = Date.now() + 3600000; // 1 hour in milliseconds

      const userData = {
         id: uuidv4(),
         ...req.body,
         password: hashedPassword, // Lưu mật khẩu đã hash
         // Admin có thể tạo bất kỳ vai trò nào
         isVerified: req.body.isVerified || false,
         verificationCode: !req.body.isVerified ? verificationCode : null,
         verificationExpires: !req.body.isVerified ? verificationExpires : null,
         createAt: new Date().toISOString(),
         updateAt: new Date().toISOString(),
         lastActive: new Date().toISOString()
      };

      const user = await User.create(userData);

      // Gửi email xác thực nếu tài khoản chưa được xác thực
      if (!user.isVerified) {
         try {
            await sendVerificationEmail(user.email, verificationCode);
         } catch (emailError) {
            console.error('Email sending failed:', emailError);
         }
      }

      res.status(201).json({
         success: true,
         message: 'Tài khoản đã được tạo thành công.',
         data: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified
         }
      });
   } catch (error) {
      error.statusCode = 400;
      error.message = 'Thất bại khi tạo tài khoản. Vui lòng kiểm tra lại thông tin.';
      handleError(error, req, res);
   }
};

// Update user
exports.updateUser = async (req, res) => {
   try {
      // Check if user exists
      const existingUser = await User.get(req.params.id);

      if (!existingUser) {
         return res.status(404).json({
            success: false,
            error: 'User not found'
         });
      }

      // Kiểm tra quyền cập nhật
      // Chỉ admin hoặc chính người dùng đó mới có thể cập nhật thông tin
      if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
         return res.status(403).json({
            success: false,
            error: 'Không có quyền cập nhật thông tin người dùng này'
         });
      }

      // Chuẩn bị dữ liệu cập nhật
      const userData = {
         ...req.body,
         updateAt: new Date().toISOString()
      };

      // Nếu có thay đổi mật khẩu, hash mật khẩu mới
      if (req.body.password) {
         const salt = await bcrypt.genSalt(10);
         userData.password = await bcrypt.hash(req.body.password, salt);
      }

      const user = await User.update({
         id: req.params.id,
         ...userData
      });

      res.status(200).json({
         success: true,
         message: 'Cập nhật thông tin người dùng thành công',
         data: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified
         }
      });
   } catch (error) {
      error.statusCode = 400;
      error.message = 'Thất bại khi cập nhật thông tin. Vui lòng thử lại.';
      handleError(error, req, res);
   }
};

// Delete user
exports.deleteUser = async (req, res) => {
   try {
      // Check if user exists
      const user = await User.get(req.params.id);

      if (!user) {
         return res.status(404).json({
            success: false,
            error: 'User not found'
         });
      }

      await User.delete(req.params.id);

      res.status(200).json({
         success: true,
         data: {}
      });
   } catch (error) {
      res.status(500).json({
         success: false,
         error: error.message
      });
   }
};
