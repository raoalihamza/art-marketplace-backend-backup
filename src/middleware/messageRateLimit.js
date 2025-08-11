const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");

// Rate limiter for sending messages
const messageRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each user to 10 messages per minute
  message: {
    status: "error",
    message:
      "Too many messages sent. Please wait before sending another message.",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID as key for authenticated requests
    return req.user ? req.user.id : req.ip;
  },
  onLimitReached: (req, res, options) => {
    logger.warn(
      `Message rate limit exceeded for user: ${req.user?.id || req.ip}`
    );
  },
});

// Rate limiter for conversation requests
const conversationRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30, // limit each user to 30 conversation requests per minute
  message: {
    status: "error",
    message: "Too many conversation requests. Please slow down.",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user.id : req.ip;
  },
});

// Rate limiter for search requests
const searchRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20, // limit each user to 20 search requests per minute
  message: {
    status: "error",
    message: "Too many search requests. Please wait before searching again.",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user.id : req.ip;
  },
});

module.exports = {
  messageRateLimit,
  conversationRateLimit,
  searchRateLimit,
};
