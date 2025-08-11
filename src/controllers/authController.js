const authService = require("../services/authService");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);

    res.status(201).json({
      status: "success",
      message: result.message,
      data: {
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in register controller: ${error.message}`);
  }
};

const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const result = await authService.verifyOTP(email, otp);

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in verifyOTP controller: ${error.message}`);
  }
};

const resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await authService.resendOTP(email);

    res.status(200).json({
      status: "success",
      message: result.message,
    });
  } catch (error) {
    next(error);
    logger.error(`Error in resendOtp controller: ${error.message}`);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await authService.login(email, password);

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in login controller: ${error.message}`);
  }
};

const logout = async (req, res, next) => {
  try {
    // In a more complex implementation, we might invalidate the token
    // For now, we'll just send a success response
    // The frontend should remove the token from storage

    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await authService.forgotPassword(email);

    res.status(200).json({
      status: "success",
      message: result.message,
    });
  } catch (error) {
    next(error);
    logger.error(`Error in forgotPassword controller: ${error.message}`);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const result = await authService.resetPassword(token, password);

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in resetPassword controller: ${error.message}`);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user.id);

    res.status(200).json({
      status: "success",
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const result = await authService.updateProfile(req.user.id, req.body);

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in updateProfile controller: ${error.message}`);
  }
};

const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const result = await authService.updatePassword(
      req.user.id,
      currentPassword,
      newPassword
    );

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        token: result.token,
        refreshToken: result.refreshToken,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in updatePassword controller: ${error.message}`);
  }
};

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  updateProfile,
  updatePassword,
};
