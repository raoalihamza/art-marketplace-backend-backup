const { param, query, validationResult } = require("express-validator");

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
  param("artworkId").isMongoId().withMessage("Invalid artwork ID"),
  handleValidationErrors,
];

// User ownership history query validation
const validateOwnershipHistoryQuery = [
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

  query("type")
    .optional()
    .isIn(["all", "acquired", "sold"])
    .withMessage("Type must be all, acquired, or sold"),

  handleValidationErrors,
];

// Search traceability records validation
const validateSearchQuery = [
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

  query("artworkId").optional().isMongoId().withMessage("Invalid artwork ID"),

  query("userId").optional().isMongoId().withMessage("Invalid user ID"),

  query("transactionType")
    .optional()
    .isIn(["created", "sold", "transferred"])
    .withMessage("Transaction type must be created, sold, or transferred"),

  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("Start date must be a valid ISO date"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("End date must be a valid ISO date"),

  handleValidationErrors,
];

// Verify ownership query validation
const validateVerifyOwnershipQuery = [
  param("artworkId").isMongoId().withMessage("Invalid artwork ID"),

  query("userId").optional().isMongoId().withMessage("Invalid user ID"),

  handleValidationErrors,
];

module.exports = {
  validateArtworkId,
  validateOwnershipHistoryQuery,
  validateSearchQuery,
  validateVerifyOwnershipQuery,
};
