const express = require("express");
const traceabilityController = require("../controllers/traceabilityController");
const { protect, restrictTo, optionalAuth } = require("../middleware/auth");
const {
  validateArtworkId,
  validateOwnershipHistoryQuery,
  validateSearchQuery,
  validateVerifyOwnershipQuery,
} = require("../validators/traceabilityValidator");

const router = express.Router();

// Get complete artwork history (Public route)
router.get(
  "/artwork/:artworkId/history",
  validateArtworkId,
  traceabilityController.getArtworkHistory
);

// Routes that work with optional authentication
router.get(
  "/artwork/:artworkId/verify",
  optionalAuth,
  validateVerifyOwnershipQuery,
  traceabilityController.verifyOwnership
);

// Protected routes (authentication required)
router.use(protect);

// Generate ownership certificate (artwork owner only)
router.get(
  "/artwork/:artworkId/certificate",
  validateArtworkId,
  traceabilityController.generateOwnershipCertificate
);

// User's ownership history
router.get(
  "/my/history",
  validateOwnershipHistoryQuery,
  traceabilityController.getUserOwnershipHistory
);

// Admin only routes
router.use(restrictTo("admin"));

// Get platform-wide traceability statistics
router.get("/stats", traceabilityController.getTraceabilityStats);

// Search all traceability records (admin only)
router.get(
  "/search",
  validateSearchQuery,
  traceabilityController.searchTraceabilityRecords
);

module.exports = router;
