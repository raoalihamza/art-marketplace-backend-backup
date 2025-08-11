const User = require("../models/User");
const AppError = require("../utils/appError");
const { verifyToken } = require("../utils/helpers");
const logger = require("../utils/logger");

// Protect routes - check if user is authenticated
const protect = async (req, res, next) => {
  try {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(
        new AppError("You are not logged in! Please log in to get access", 401)
      );
    }

    const decoded = verifyToken(token);

    const currentUser = await User.findById(decoded.id).select("+password");
    if (!currentUser) {
      return next(
        new AppError("The user belonging to this token no longer exists", 401)
      );
    }

    if (!currentUser.isVerified) {
      return next(
        new AppError("Please verify your account to access this resource.", 401)
      );
    }

    req.user = currentUser;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Invalid token, Please log in again", 401));
    } else if (error.name === "TokenExpiredError") {
      return next(
        new AppError("Your token has expired! , Please log in again", 401)
      );
    }
    logger.error(`Error in protect middleware: ${error.message}`);
    return next(new AppError("Authentication failed", 401));
  }
};

// Restrict access to certain roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission to perform this action", 403)
      );
    }
    next();
  };
};

// Optional authentication - for routes that can be accessed by both authenticated and unauthenticated users
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (token) {
      const decoded = verifyToken(token);
      const currentUser = await User.findById(decoded.id).select("+password");
      if (currentUser && currentUser.isVerified) {
        req.user = currentUser;
      }
    }
    next();
  } catch (error) {
    // If token is invalid, just continue without user
    next();
  }
};

// check if user is verified
const requireVerification = (req, res, next) => {
  if (!req.user.isVerified) {
    return next(
      new AppError("Please verify your account to access this resource.", 401)
    );
  }
  next();
};

module.exports = {
  protect,
  restrictTo,
  optionalAuth,
  requireVerification,
};
