const { body, param, query, validationResult } = require("express-validator");

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

/*
// TEMPORARILY DISABLED: Listing fee requirement
// Create listing payment session validation
const validateCreateListingSession = [
  body("artworkId").isMongoId().withMessage("Valid artwork ID is required"),

  handleValidationErrors,
];
*/

// Create purchase session validation
const validateCreatePurchaseSession = [
  body("artworkId").isMongoId().withMessage("Valid artwork ID is required"),

  handleValidationErrors,
];

// Payment history query validation
const validatePaymentHistoryQuery = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("Limit must be between 1 and 50"),

  query("type")
    .optional()
    .isIn(["listing_fee", "sale", "all"])
    .withMessage("Type must be listing_fee, sale, or all"),

  query("status")
    .optional()
    .isIn(["pending", "completed", "failed", "refunded"])
    .withMessage("Status must be pending, completed, failed, or refunded"),

  handleValidationErrors,
];

// Transaction ID validation
const validateTransactionId = [
  param("id").isMongoId().withMessage("Invalid transaction ID"),

  handleValidationErrors,
];

module.exports = {
  // validateCreateListingSession,
  validateCreatePurchaseSession,
  validatePaymentHistoryQuery,
  validateTransactionId,
};
