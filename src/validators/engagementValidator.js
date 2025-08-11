const { param, query, validationResult } = require("express-validator");
const User = require("../models/User");
const Artwork = require("../models/Artwork");

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
  param("artworkId")
    .isMongoId()
    .withMessage("Valid artwork ID is required")
    .custom(async (value) => {
      const artwork = await Artwork.findById(value);
      if (!artwork) {
        throw new Error("Artwork not found");
      }
      return true;
    }),

  handleValidationErrors,
];

// User ID validation (for artist following)
const validateUserId = [
  param("artistId")
    .isMongoId()
    .withMessage("Valid artist ID is required")
    .custom(async (value, { req }) => {
      const user = await User.findById(value);
      if (!user) {
        throw new Error("User not found");
      }

      if (user.role !== "artist") {
        throw new Error("You can only follow artists");
      }

      if (!user.isVerified) {
        throw new Error("Cannot follow unverified artist");
      }

      return true;
    }),

  handleValidationErrors,
];

// Query parameters validation for engagement endpoints
const validateEngagementQuery = [
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

  handleValidationErrors,
];

module.exports = {
  validateArtworkId,
  validateUserId,
  validateEngagementQuery,
};
