const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (email, otp, fullName) => {
  try {
    console.log('📧 Attempting to send email...');
    console.log('Email config:', {
      service: process.env.EMAIL_SERVICE,
      user: process.env.EMAIL_USER,
      hasPassword: !!process.env.EMAIL_PASS
    });
    console.log('Sending to:', email);
    console.log('OTP:', otp);

    const transporter = createTransporter();

    const mailOptions = {
      from: `"Apex" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Email Verification - OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333; text-align: center;">Email Verification</h2>
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Thank you for registering with Apex. Please use the following OTP to verify your email address:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <h1 style="color: #4CAF50; letter-spacing: 5px; margin: 0;">${otp}</h1>
          </div>
          <p style="color: #666;">This OTP is valid for <strong>10 minutes</strong>.</p>
          <p style="color: #999; font-size: 12px;">If you didn't request this verification, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Apex. All rights reserved.</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    console.error('Error details:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateOTP,
  sendOTPEmail
};
