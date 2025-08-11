const { query, validationResult } = require("express-validator");

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

// Validate analytics query parameters
const validateAnalyticsQuery = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),

  query("period")
    .optional()
    .isIn(["week", "month", "quarter", "year", "all"])
    .withMessage("Period must be one of: week, month, quarter, year, all"),

  query("category")
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Category must be between 1 and 50 characters"),

  handleValidationErrors,
];

// Validate report generation query
const validateReportQuery = [
  query("period")
    .optional()
    .isIn(["week", "month", "quarter", "year"])
    .withMessage("Period must be one of: week, month, quarter, year"),

  handleValidationErrors,
];

module.exports = {
  validateAnalyticsQuery,
  validateReportQuery,
};
