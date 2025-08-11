const { body, param, query, validationResult } = require("express-validator");
const User = require("../models/User");

// Validation middleware to check for errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

// Send message validation
const validateSendMessage = [
  body("receiverId")
    .isMongoId()
    .withMessage("Valid receiver ID is required")
    .custom(async (value, { req }) => {
      // Check if receiver exists
      const receiver = await User.findById(value);
      if (!receiver) {
        throw new Error("Receiver not found");
      }

      // Check if receiver is verified
      if (!receiver.isVerified) {
        throw new Error("Cannot send message to unverified user");
      }

      // Check if trying to message themselves
      if (value === req.user.id) {
        throw new Error("Cannot send message to yourself");
      }

      return true;
    }),

  body("content")
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage("Message content must be between 1 and 1000 characters")
    .matches(/^[^<>{}]*$/)
    .withMessage("Message cannot contain HTML tags or special characters"),

  handleValidationErrors,
];

// Get conversation validation
const validateGetConversation = [
  param("userId")
    .isMongoId()
    .withMessage("Valid user ID is required")
    .custom(async (value, { req }) => {
      // Check if user exists
      const user = await User.findById(value);
      if (!user) {
        throw new Error("User not found");
      }

      // Check if trying to get conversation with themselves
      if (value === req.user.id) {
        throw new Error("Cannot get conversation with yourself");
      }

      return true;
    }),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  handleValidationErrors,
];

// Mark as read validation
const validateMarkAsRead = [
  param("userId")
    .isMongoId()
    .withMessage("Valid user ID is required")
    .custom(async (value, { req }) => {
      // Check if user exists
      const user = await User.findById(value);
      if (!user) {
        throw new Error("User not found");
      }

      // Check if trying to mark own messages as read
      if (value === req.user.id) {
        throw new Error("Cannot mark conversation with yourself as read");
      }

      return true;
    }),

  handleValidationErrors,
];

// Delete message validation
const validateDeleteMessage = [
  param("messageId").isMongoId().withMessage("Valid message ID is required"),

  handleValidationErrors,
];

// Block user validation
const validateBlockUser = [
  param("userId")
    .isMongoId()
    .withMessage("Valid user ID is required")
    .custom(async (value, { req }) => {
      // Check if user exists
      const user = await User.findById(value);
      if (!user) {
        throw new Error("User not found");
      }

      // Check if trying to block themselves
      if (value === req.user.id) {
        throw new Error("Cannot block yourself");
      }

      // Check if user has different role
      if (user.role === req.user.role) {
        throw new Error("Can only block users with different roles");
      }

      return true;
    }),

  handleValidationErrors,
];

// Search conversations validation
const validateSearchConversations = [
  query("query")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search query must be between 1 and 100 characters")
    .matches(/^[a-zA-Z0-9\s.,!?-]*$/)
    .withMessage("Search query contains invalid characters"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),

  handleValidationErrors,
];

// Rate limiting validation (to be used with express-rate-limit)
const messageRateLimit = {
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each user to 10 messages per minute
  message: {
    status: "error",
    message:
      "Too many messages sent. Please wait before sending another message.",
  },
  standardHeaders: true,
  legacyHeaders: false,
};

const validateSearchWithinConversation = [
  param("userId").isMongoId().withMessage("Valid user ID is required"),

  query("query")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search query must be between 1 and 100 characters"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),

  handleValidationErrors,
];

module.exports = {
  validateSendMessage,
  validateGetConversation,
  validateMarkAsRead,
  validateDeleteMessage,
  validateBlockUser,
  validateSearchConversations,
  messageRateLimit,
  validateSearchWithinConversation,
};
