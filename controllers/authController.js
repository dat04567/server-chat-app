const User = require('../models/userModel')
const bcrypt = require('bcrypt')
const {
  generateVerificationToken,
  sendVerificationEmail,
  generateVerificationCode
} = require('../utils/emailService')
const { handleError } = require('../utils')
const jwt = require('jsonwebtoken')
// Đăng ký tài khoản cho người dùng
exports.register = async (req, res) => {
  const { username, password, email, lastName, firstName } = req.body

  try {
    // Kiểm tra username đã tồn tại chưa
    const existingUserByUsername = await User.scan({
      username: { eq: username }
    }).exec()

    if (existingUserByUsername && existingUserByUsername.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Tên ngườưi dùng đã tồn tại, vui lòng chọn tên khác'
      })
    }

    // Kiểm tra email đã tồn tại chưa
    const existingUserByEmail = await User.scan({
      email: { eq: email }
    }).exec()

    if (existingUserByEmail && existingUserByEmail.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Email đã tồn tại, vui lòng sử dụng email khác'
      })
    }

    // Generate verification token
    const verificationToken = generateVerificationToken()
    console.log(verificationToken)
    // Set expiration time (1 hour from now)
    const verificationExpires = Date.now() + 300000 // 5 minutes in milliseconds

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const userData = {
      username,
      email,
      password: hashedPassword, // Lưu mật khẩu đã được hash
      role: 'user', // Đảm bảo người đăng ký chỉ có quyền user
      profile: {
        firstName,
        lastName
      },
      isVerified: false,
      verificationToken,
      verificationExpires,
      createAt: new Date().toISOString(),
      updateAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    }

    const user = await User.create(userData)
    const user = await User.create(userData)

    // Send verification email
    try {
      await sendVerificationEmail(user.email, verificationToken, user.id)
    } catch (emailError) {
      console.error('Email sending failed:', emailError)
      // Giữ người dùng trong DB nhưng thông báo lỗi gửi email
    }

    res.status(201).json({
      success: true,
      message:
        'Tài khoản đã được tạo thành công. Vui lòng kiểm tra email để xác nhận tài khoản.',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        isVerified: user.isVerified
      }
    })
  } catch (error) {
    error.statusCode = 400
    error.message =
      'Thất bại khi đăng ký tài khoản. Vui lòng kiểm tra lại thông tin.'
    handleError(error, req, res)
  }
}

// Đăng nhập
exports.login = async (req, res) => {
  const { email, password } = req.body

  try {
    // Tìm người dùng bằng email
    const users = await User.scan({
      email: { eq: email }
    }).exec()

    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Email hoặc mật khẩu không chính xác'
      })
    }

    const user = users[0]

    // So sánh mật khẩu đã hash
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Email hoặc mật khẩu không chính xác'
      })
    }

    // Kiểm tra xem tài khoản đã xác thực email chưa
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        error:
          'Tài khoản chưa được xác thực email. Vui lòng xác thực email trước khi đăng nhập.'
      })
    }

    // Tạo JWT token
    const JWT_SECRET =
      process.env.JWT_SECRET || 'your-secret-key-123456-change-in-production'
    const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d'

    const token = jwt.sign({ id: user.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    })

    // Cập nhật thời gian hoạt động cuối cùng
    await User.update({
      id: user.id,
      lastActive: new Date().toISOString()
    })

    res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    })
  } catch (error) {
    error.statusCode = 500
    error.message = 'Lỗi đăng nhập. Vui lòng thử lại sau.'
    handleError(error, req, res)
  }
}

// Đăng xuất
exports.logout = async (req, res) => {
  // Sẽ triển khai sau
}

// Làm mới token
exports.refreshToken = async (req, res) => {
  // Sẽ triển khai sau
}

// Xác thực email bằng URL token
exports.verifyEmail = async (req, res) => {
  const { token, userId } = req.query
  console.log(`Verifying email for userId: ${userId} with token: ${token}`)

  try {
    // Find user by ID
    const user = await User.get(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Không tìm thấy người dùng'
      })
    }

    // Check if already verified
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email đã được xác thực trước đó'
      })
    }

    // Check if verification token is valid
    if (user.verificationToken !== token) {
      return res.status(400).json({
        success: false,
        error: 'Liên kết xác thực không hợp lệ'
      })
    }

    // Check if verification token has expired
    if (user.verificationExpires < Date.now()) {
      return res.status(400).json({
        success: false,
        error: 'Liên kết xác thực đã hết hạn'
      })
    }

    // Update user to verified status
    await User.update({
      id: user.id,
      isVerified: true,
      verificationToken: '',
      verificationExpires: 0,
      updateAt: new Date().toISOString()
    })

    res.status(200).json({
      success: true,
      message: 'Email đã được xác thực thành công'
    })
  } catch (error) {
    handleError(error, req, res)
  }
}

// Gửi lại liên kết xác thực
exports.resendVerificationEmail = async (req, res) => {
  const { email } = req.body

  try {
    // Find user by email
    const users = await User.scan({
      email: { eq: email }
    }).exec()

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Không tìm thấy người dùng với email này'
      })
    }

    const user = users[0]

    // Check if already verified
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email đã được xác thực trước đó'
      })
    }

    // Generate new verification token and expiration time
    const verificationToken = generateVerificationToken()
    const verificationExpires = Date.now() + 300000 // 1 hour in milliseconds

    // Update user with new verification token
    await User.update({
      id: user.id,
      verificationToken,
      verificationExpires,
      updateAt: new Date().toISOString()
    })

    // Send verification email
    try {
      await sendVerificationEmail(user.email, verificationToken, user.id)
    } catch (emailError) {
      return res.status(500).json({
        success: false,
        error: 'Lỗi khi gửi email xác thực. Vui lòng thử lại sau.'
      })
    }

    res.status(200).json({
      success: true,
      message: 'Liên kết xác thực mới đã được gửi đến email của bạn'
    })
  } catch (error) {
    handleError(error, req, res)
  }
}
