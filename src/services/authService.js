const User = require("../models/User");
const ArtistProfile = require("../models/ArtistProfile");
const emailService = require("./emailService");
const {
  generateToken,
  generateRefreshToken,
  generateOTP,
  generatePasswordResetToken,
  hashPasswordResetToken,
} = require("../utils/helpers");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

class AuthService {
  async register(userData) {
    const { username, email, password, role = "buyer" } = userData;

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Create user with unverified status
    const user = await User.create({
      username,
      email,
      password,
      role,
      isVerified: false,
      verificationOTP: otp,
      verificationOTPExpires: otpExpires,
    });

    // If user is an artist, create an artist profile
    if (role === "artist") {
      await ArtistProfile.create({
        userId: user._id,
        bio: "",
        verified: false,
      });
    }

    // Send verification email
    await emailService.sendOTPVerification(email, username, otp);

    return {
      message:
        "Registration successful! Please check your email for verification OTP.",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }

  // Verify Otp service
  async verifyOTP(email, otp) {
    const user = await User.findOne({
      email,
      verificationOTP: otp,
      verificationOTPExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new AppError("Invalid or expired OTP", 400);
    }

    // Mark user as verified
    user.isVerified = true;
    user.verificationOTP = undefined;
    user.verificationOTPExpires = undefined;
    await user.save();

    // Send welcome email
    await emailService.sendWelcomeEmail(user.email, user.username, user.role);

    // Generate Tokens
    const token = generateToken({ id: user._id });
    const refreshToken = generateRefreshToken({ id: user._id });

    return {
      message: "Email verified successfully!",
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }

  // Resend OTP service
  async resendOTP(email) {
    const user = await User.findOne({ email });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (user.isVerified) {
      throw new AppError("User is already verified", 400);
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.verificationOTP = otp;
    user.verificationOTPExpires = otpExpires;
    await user.save();

    // Send new OTP email
    await emailService.sendOTPVerification(email, user.username, otp);

    return {
      message: "New OTP sent successfully! Please check your email.",
    };
  }

  // login user service
  async login(email, password) {
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      throw new AppError("Invalid email or password", 401);
    }

    if (!user.isVerified) {
      throw new AppError("Please verify your email before logging in", 401);
    }

    // Update last active state for a user
    user.lastActive = new Date();
    await user.save();

    // Generate Tokens
    const token = generateToken({ id: user._id });
    const refreshToken = generateRefreshToken({ id: user._id });

    return {
      message: "Login successful!",
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profile: user.profile,
      },
    };
  }

  // Forgot password service
  async forgotPassword(email) {
    const user = await User.findOne({ email });

    if (!user) {
      throw new AppError("There is no user with that email address", 404);
    }

    // Generate password reset token
    const { resetToken, hashedToken } = generatePasswordResetToken();

    // update user info in db
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    // Create reset URL
    const resetURL = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    try {
      await emailService.sendPasswordReset(user.email, user.username, resetURL);

      return {
        message:
          "Password reset email sent successfully! Please check your email.",
      };
    } catch (error) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      throw new AppError(
        "Failed to send password reset email. Please try again later.",
        500
      );
    }
  }

  // Reset password service
  async resetPassword(token, password) {
    // get user based on token
    const hashedToken = hashPasswordResetToken(token);
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new AppError("Token is invalid or has expired", 400);
    }

    // If token has not expired, and there is user, set the new password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Generate new tokens
    const jwtToken = generateToken({ id: user._id });
    const refreshToken = generateRefreshToken({ id: user._id });

    return {
      message: "Password reset successful!",
      token: jwtToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }

  // Update user profile service
  async updateProfile(userId, updateData) {
    const user = await User.findById(userId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Update allowed fields
    const allowedFields = ["username", "profile"];
    const filteredData = {};

    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        if (key === "profile") {
          filteredData.profile = { ...user.profile, ...updateData.profile };
        } else {
          filteredData[key] = updateData[key];
        }
      }
    });

    const updatedUser = await User.findByIdAndUpdate(userId, filteredData, {
      new: true,
      runValidators: true,
    });

    return {
      message: "Profile updated successfully!",
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        profile: updatedUser.profile,
      },
    };
  }

  // Update password service
  async updatePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select("+password");

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Check if current password is correct
    if (!(await user.comparePassword(currentPassword))) {
      throw new AppError("Your current password is incorrect", 401);
    }

    // update password
    user.password = newPassword;
    await user.save();

    // Generate new tokens
    const token = generateToken({ id: user._id });
    const refreshToken = generateRefreshToken({ id: user._id });

    return {
      message: "Password updated successfully!",
      token,
      refreshToken,
    };
  }

  // Get current user service
  async getCurrentUser(userId) {
    let user;

    // populate artworks if the model exists, otherwise just get the user
    try {
      const mongoose = require("mongoose");
      if (mongoose.models.Artwork) {
        user = await User.findById(userId).populate("artworks");
      } else {
        user = await User.findById(userId);
      }
    } catch (error) {
      user = await User.findById(userId);
    }

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // If user is an artist, get artist profile
    let artistProfile = null;
    if (user.role === "artist") {
      artistProfile = await ArtistProfile.findOne({ userId: user._id });
    }

    return {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      profile: user.profile,
      credits: user.credits,
      createdAt: user.createdAt,
      lastActive: user.lastActive,
      artistProfile: artistProfile || undefined,
      // Include artworks only if they exist
      ...(user.artworks && { artworks: user.artworks }),
    };
  }
}

module.exports = new AuthService();
