const nodemailer = require("nodemailer");
const config = require("../config/config");
const logger = require("../utils/logger");

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: false,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });
  }

  // send email with separate template
  async sendEmail(options) {
    try {
      const mailOptions = {
        from: `3rd Hand Art Marketplace <${config.email.user}>`,
        to: options.email,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(
        `Email sent to ${options.email} with subject: ${options.subject}`
      );
    } catch (error) {
      logger.error(`Error sending email: ${error.message}`);
      throw new Error("Email could not be sent");
    }
  }

  // send OTP verification email
  async sendOTPVerification(email, username, otp) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to 3rd Hand Art Marketplace!</h2>
        <p>Hello ${username},</p>
        <p>Thank you for registering with 3rd Hand. Please verify your email address using the OTP below:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #007bff; font-size: 32px; margin: 0;">${otp}</h1>
        </div>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you didn't create an account with us, please ignore this email.</p>
        <p>Best regards,<br>3rd Hand Art Marketplace Team</p>
      </div>
    `;

    await this.sendEmail({
      email,
      subject: "Verify Your Email - 3rd Hand Art Marketplace",
      html,
    });
  }

  // send password reset email
  async sendPasswordReset(email, username, resetURL) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${username},</p>
        <p>You requested a password reset for your 3rd Hand Art Marketplace account.</p>
        <p>Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetURL}" style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </div>
        <p>This link will expire in 10 minutes.</p>
        <p>If you didn't request a password reset, please ignore this email.</p>
        <p>Best regards,<br>3rd Hand Art Marketplace Team</p>
      </div>
    `;

    await this.sendEmail({
      email,
      subject: "Password Reset - 3rd Hand Art Marketplace",
      html,
    });
  }

  // Send welcome email after verification
  async sendWelcomeEmail(email, username, role) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to 3rd Hand Art Marketplace!</h2>
        <p>Hello ${username},</p>
        <p>Your account has been successfully verified! Welcome to the 3rd Hand community.</p>
        ${
          role === "artist"
            ? "<p>As an artist, you can now start uploading your artwork and reach art lovers worldwide. Remember, there's a €1 listing fee for each artwork you post.</p>"
            : "<p>As a buyer, you can now browse and purchase amazing artwork from talented artists around the world.</p>"
        }
        <div style="text-align: center; margin: 30px 0;">
          <a href="${
            config.frontendUrl
          }/dashboard" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Go to Dashboard</a>
        </div>
        <p>If you have any questions, feel free to contact our support team.</p>
        <p>Best regards,<br>3rd Hand Art Marketplace Team</p>
      </div>
    `;

    await this.sendEmail({
      email,
      subject: "Welcome to 3rd Hand Art Marketplace!",
      html,
    });
  }

  // Send artwork creation confirmation email
  async sendArtworkCreationConfirmation(
    email,
    username,
    artworkTitle,
    artworkId
  ) {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #007bff;">Artwork Submitted Successfully! 🎨</h2>
      <p>Hello ${username},</p>
      <p>Your artwork "<strong>${artworkTitle}</strong>" has been successfully submitted to our marketplace.</p>
      <div style="background-color: #e7f3ff; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #007bff;">
        <h3 style="margin: 0 0 10px 0; color: #0056b3;">What happens next?</h3>
        <p style="margin: 0; color: #0056b3;">• Our team will review your artwork within 24-48 hours</p>
        <p style="margin: 0; color: #0056b3;">• You'll receive an email when it's approved and published</p>
        <p style="margin: 0; color: #0056b3;">• Once live, buyers can discover and purchase your artwork</p>
      </div>
      <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
        <p style="margin: 0; color: #856404;"><strong>Review Tip:</strong> Make sure your artwork meets our quality guidelines to ensure quick approval.</p>
      </div>
      <p>Thank you for sharing your creativity with our community!</p>
      <p>Best regards,<br>3rd Hand Art Marketplace Team</p>
    </div>
  `;

    await this.sendEmail({
      email,
      subject: "Artwork Submitted - 3rd Hand Art Marketplace",
      html,
    });
  }

  // Send listing fee confirmation
  async sendListingFeeConfirmation(email, username, artworkTitle, amount) {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Payment Confirmed!</h2>
      <p>Hello ${username},</p>
      <p>Your listing fee payment has been successfully processed.</p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px 0;">Payment Details:</h3>
        <p><strong>Artwork:</strong> ${artworkTitle}</p>
        <p><strong>Amount:</strong> €${amount}</p>
        <p><strong>Type:</strong> Listing Fee</p>
      </div>
      <p>Your artwork is now pending admin approval. You'll receive another email once it's reviewed.</p>
      <p>Best regards,<br>Art Marketplace Team</p>
    </div>
  `;

    await this.sendEmail({
      email,
      subject: "Listing Fee Payment Confirmed - 3rd Hand Art Marketplace",
      html,
    });
  }

  // Send purchase confirmation
  async sendPurchaseConfirmation(email, username, artworkTitle, amount) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">Purchase Successful!</h2>
        <p>Hello ${username},</p>
        <p>Congratulations! Your artwork purchase has been completed successfully.</p>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0;">Purchase Details:</h3>
          <p><strong>Artwork:</strong> ${artworkTitle}</p>
          <p><strong>Amount Paid:</strong> €${amount}</p>
          <p><strong>Purchase Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        <p>The artist will be in touch with you soon regarding delivery arrangements.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${
            config.frontendUrl
          }/dashboard/purchases" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Purchase History</a>
        </div>
        <p>Thank you for supporting artists on our platform!</p>
        <p>Best regards,<br>Art Marketplace Team</p>
      </div>
    `;

    await this.sendEmail({
      email,
      subject: "Artwork Purchase Confirmed - #rd Hand Art Marketplace",
      html,
    });
  }

  // Send sale notification to artist
  async sendSaleNotification(email, username, artworkTitle, amount) {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #007bff;">Great News! Your Artwork Sold!</h2>
      <p>Hello ${username},</p>
      <p>Congratulations! Your artwork has been sold on Art Marketplace.</p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px 0;">Sale Details:</h3>
        <p><strong>Artwork:</strong> ${artworkTitle}</p>
        <p><strong>Sale Price:</strong> €${amount}</p>
        <p><strong>Sale Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Your Earnings:</strong> €${(amount * 0.95).toFixed(
          2
        )} (after 5% platform fee)</p>
      </div>
      <p>Please contact the buyer to arrange delivery. You can find their contact information in your dashboard.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${
          config.frontendUrl
        }/dashboard/sales" style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Sales Dashboard</a>
      </div>
      <p>Thank you for being part of our artist community!</p>
      <p>Best regards,<br>Art Marketplace Team</p>
    </div>
  `;

    await this.sendEmail({
      email,
      subject: "Your Artwork Has Been Sold! - 3rd Hand Art Marketplace",
      html,
    });
  }

  // Send payment failed notification
  async sendPaymentFailedNotification(
    email,
    username,
    artworkTitle,
    transactionType
  ) {
    const typeLabel =
      transactionType === "listing_fee" ? "Listing Fee" : "Purchase";

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc3545;">Payment Failed</h2>
      <p>Hello ${username},</p>
      <p>Unfortunately, your ${typeLabel.toLowerCase()} payment could not be processed.</p>
      <div style="background-color: #f8d7da; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc3545;">
        <h3 style="margin: 0 0 10px 0;">Failed Payment Details:</h3>
        <p><strong>Artwork:</strong> ${artworkTitle}</p>
        <p><strong>Payment Type:</strong> ${typeLabel}</p>
        <p><strong>Failed At:</strong> ${new Date().toLocaleString()}</p>
      </div>
      <p>Please check your payment method and try again. If you continue to experience issues, please contact our support team.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${
          config.frontendUrl
        }/payment/retry" style="background-color: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Try Again</a>
      </div>
      <p>If you need assistance, please don't hesitate to contact us.</p>
      <p>Best regards,<br>Art Marketplace Team</p>
    </div>
  `;

    await this.sendEmail({
      email,
      subject: `Payment Failed - ${typeLabel} - 3rd Hand Art Marketplace`,
      html,
    });
  }
}

module.exports = new EmailService();
