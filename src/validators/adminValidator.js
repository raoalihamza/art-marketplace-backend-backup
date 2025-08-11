const { body, query, param, validationResult } = require("express-validator");

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

// Artwork ID validation
const validateArtworkId = [
  param("id").isMongoId().withMessage("Invalide artwork id"),

  handleValidationErrors,
];

// reject artwork validation
const validateRejectArtwork = [
  param("id").isMongoId().withMessage("Invalide artwork id"),

  body("rejectionReason")
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Rejection reason must be between 10 and 500 characters"),

  handleValidationErrors,
];

// Admin query validation for pending artworks
const validatePendingArtworksQuery = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50")
    .toInt(),

  query("sort")
    .optional()
    .isIn(["createdAt", "-createdAt", "price", "-price", "title", "-title"])
    .withMessage("Invalid sort parameter"),

  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search must be between 1 and 100 characters"),

  query("minPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Min price must be a positive number"),

  query("maxPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Max price must be a positive number"),

  handleValidationErrors,
];

// Admin query validation for users
const validateUsersQuery = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),

  query("role")
    .optional()
    .isIn(["artist", "buyer", "admin"])
    .withMessage("Role must be artist, buyer, or admin"),

  query("isVerified")
    .optional()
    .isBoolean()
    .withMessage("isVerified must be a boolean value"),

  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search must be between 1 and 100 characters"),

  query("sort")
    .optional()
    .isIn([
      "createdAt",
      "-createdAt",
      "username",
      "-username",
      "email",
      "-email",
      "lastActive",
      "-lastActive",
    ])
    .withMessage("Invalid sort parameter"),

  handleValidationErrors,
];

// Admin query validation for artworks
const validateArtworksQuery = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),

  query("status")
    .optional()
    .isIn(["pending", "approved", "rejected"])
    .withMessage("Status must be pending, approved, or rejected"),

  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search must be between 1 and 100 characters"),

  query("artist").optional().isMongoId().withMessage("Invalid artist id"),

  query("sort")
    .optional()
    .isIn([
      "createdAt",
      "-createdAt",
      "price",
      "-price",
      "title",
      "-title",
      "approvedAt",
      "-approvedAt",
    ])
    .withMessage("Invalid sort parameter"),

  handleValidationErrors,
];

// Admin query validation for transactions
const validateTransactionsQuery = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),

  query("type")
    .optional()
    .isIn(["listing_fee", "sale"])
    .withMessage("Type must be listing_fee or sale"),

  query("status")
    .optional()
    .isIn(["pending", "completed", "failed", "refunded"])
    .withMessage("Status must be pending, completed, failed, or refunded"),

  query("sort")
    .optional()
    .isIn(["timestamp", "-timestamp", "amount", "-amount", "status", "-status"])
    .withMessage("Invalid sort parameter"),

  handleValidationErrors,
];

module.exports = {
  validateArtworkId,
  validateRejectArtwork,
  validatePendingArtworksQuery,
  validateUsersQuery,
  validateArtworksQuery,
  validateTransactionsQuery,
};
