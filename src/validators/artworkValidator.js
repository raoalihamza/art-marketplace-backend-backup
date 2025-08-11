const { body, query, param, validationResult } = require("express-validator");

// Validation middleware to check an error
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

// create artwork validation
const validateCreateArtwork = [
  body("title")
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage("Title must be between 3 and 100 characters"),

  body("description")
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage("Description must be between 10 and 2000 characters"),

  body("price")
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number"),

  body("medium")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Medium cannot exceed 50 characters"),

  body("tags")
    .optional()
    .isArray()
    .withMessage("Tags must be an array")
    .custom((tags) => {
      if (tags && tags.length > 10) {
        throw new Error("You can only have up to 10 tags");
      }
      if (
        tags &&
        tags.some((tag) => typeof tag !== "string" || tag.length > 30)
      ) {
        throw new Error(
          "Each tag must be a string with a maximum length of 30 characters"
        );
      }
      return true;
    }),

  body("dimensions.width")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Width must be a positive number"),

  body("dimensions.height")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Height must be a positive number"),

  body("dimensions.unit")
    .optional()
    .isIn(["cm", "in"])
    .withMessage("Unit must be either 'cm' or 'in'"),

  body("year")
    .optional()
    .isInt({ min: 1000, max: new Date().getFullYear() })
    .withMessage("Year must be a valid year between 1000 and the current year"),

  body("isOriginal")
    .optional()
    .isBoolean()
    .withMessage("isOriginal must be a boolean value"),

  body("edition.number")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Edition number must be a positive integer"),

  body("edition.total")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Total editions must be a positive integer")
    .custom((value, { req }) => {
      if (
        req.body.edition &&
        req.body.edition.number &&
        req.body.edition.number > value
      ) {
        throw new Error("Edition number cannot be greater than total editions");
      }
      return true;
    }),

  handleValidationErrors,
];

// Update artwork validation
const validateUpdateArtwork = [
  body("title")
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage("Title must be between 3 and 100 characters"),

  body("description")
    .optional()
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage("Description must be between 10 and 2000 characters"),

  body("price")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Price must be a positive number"),

  body("medium")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Medium cannot exceed 50 characters"),

  body("tags")
    .optional()
    .isArray()
    .withMessage("Tags must be an array")
    .custom((tags) => {
      if (tags && tags.length > 10) {
        throw new Error("You can only have up to 10 tags");
      }
      if (
        tags &&
        tags.some((tag) => typeof tag !== "string" || tag.length > 30)
      ) {
        throw new Error(
          "Each tag must be a string with a maximum length of 30 characters"
        );
      }
      return true;
    }),

  body("dimensions.width")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Width must be a positive number"),

  body("dimensions.height")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Height must be a positive number"),

  body("dimensions.unit")
    .optional()
    .isIn(["cm", "in"])
    .withMessage("Unit must be either 'cm' or 'in'"),

  body("year")
    .optional()
    .isInt({ min: 1000, max: new Date().getFullYear() })
    .withMessage("Year must be a valid year between 1000 and the current year"),

  body("isOriginal")
    .optional()
    .isBoolean()
    .withMessage("isOriginal must be a boolean value"),

  body("edition.number")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Edition number must be a positive integer"),

  body("edition.total")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Total editions must be a positive integer")
    .custom((value, { req }) => {
      if (
        req.body.edition &&
        req.body.edition.number &&
        req.body.edition.number > value
      ) {
        throw new Error("Edition number cannot be greater than total editions");
      }
      return true;
    }),

  handleValidationErrors,
];

// Query validation for getting artworks
const validateArtworkQuery = [
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

  query("status")
    .optional()
    .isIn(["pending", "approved", "rejected"])
    .withMessage("Status must be pending, approved, or rejected"),

  query("minPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Minimum price must be a positive number"),

  query("maxPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Maximum price must be a positive number"),

  query("tags")
    .optional()
    .custom((value) => {
      if (typeof value === "string") {
        // Single tag
        return true;
      }
      if (Array.isArray(value)) {
        // Multiple tags
        return value.every((tag) => typeof tag === "string");
      }
      throw new Error("Tags must be string or array of strings");
    }),

  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search term must be between 1 and 100 characters"),

  query("view")
    .optional()
    .isIn(["created", "owned", "sold"])
    .withMessage("View must be created, owned, or sold"),

  query("viewType")
    .optional()
    .isIn(["created", "owned", "sold"])
    .withMessage("ViewType must be created, owned, or sold"),

  handleValidationErrors,
];

// Artwork ID validation
const validateArtworkId = [
  param("id").isMongoId().withMessage("Invalid artwork ID"),

  handleValidationErrors,
];

module.exports = {
  validateCreateArtwork,
  validateUpdateArtwork,
  validateArtworkQuery,
  validateArtworkId,
};
