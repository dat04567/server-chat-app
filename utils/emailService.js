const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Tạo transporter cho Nodemailer
const transporter = nodemailer.createTransport({
   // service: process.env.EMAIL_SERVICE || 'gmail',
   host: 'smtp.zoho.com',
   port: 465,
   secure: true,
   auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
   }
});

/**
 * Generate a random verification token
 * @returns {string} Random verification token
 */
exports.generateVerificationToken = () => {
   return crypto.randomBytes(32).toString('hex');
};

/**
 * Send verification email with verification link using Nodemailer
 * @param {string} email - Recipient email address
 * @param {string} token - Verification token
 * @param {string} userId - User ID for additional security
 * @returns {Promise} - Promise object representing the operation
 */
exports.sendVerificationEmail = async (email, token, userId) => {
   // Construct verification URL
   const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
   const verifyUrl = `${baseUrl}/verify-email?token=${token}&userId=${userId}&email=${encodeURIComponent(email)}`;

   const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;

   // Email options
   const mailOptions = {
      from: `"Xác minh tài khoản" <${fromEmail}>`,
      to: email,
      subject: 'Xác Minh Email',
      html: `
         <html>
           <body>
             <h1>Xác Minh Email</h1>
             <p>Cảm ơn bạn đã đăng ký. Vui lòng nhấp vào nút bên dưới để xác minh địa chỉ email của bạn:</p>
             <div style="text-align: center; margin: 20px 0;">
               <a href="${verifyUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Xác minh email của tôi</a>
             </div>
             <p>Hoặc bạn có thể sao chép và dán liên kết này vào trình duyệt của bạn:</p>
             <p style="word-break: break-all; background-color: #f4f4f4; padding: 10px;">${verifyUrl}</p>
             <p>Liên kết này sẽ hết hạn trong vòng 1 giờ.</p>
           </body>
         </html>
      `,
      text: `Vui lòng xác minh email của bạn bằng cách nhấp vào liên kết sau: ${verifyUrl}. Liên kết này sẽ hết hạn trong vòng 1 giờ.`,
   };

   try {
      // Gửi email sử dụng Nodemailer
      const result = await transporter.sendMail(mailOptions);

      return result;
   } catch (error) {
      console.error('Error se dnding email:', error);
      throw error;
   }
};