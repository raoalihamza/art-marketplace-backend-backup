const express = require("express");
const adminController = require("../controllers/adminController");
const { protect, restrictTo } = require("../middleware/auth");
const {
  validateArtworkId,
  validateRejectArtwork,
  validatePendingArtworksQuery,
  validateUsersQuery,
  validateArtworksQuery,
  validateTransactionsQuery,
} = require("../validators/adminValidator");

const router = express.Router();

// All admin routes requires authentication and admin role
router.use(protect);
router.use(restrictTo("admin"));

// Dashboard overview
router.get("/overview", adminController.getPlatformOverview);

// artowrk management
router.get(
  "/artworks/pending",
  validatePendingArtworksQuery,
  adminController.getPendingArtworks
);

router.patch(
  "/artworks/:id/approve",
  validateArtworkId,
  adminController.approveArtwork
);

router.patch(
  "/artworks/:id/reject",
  validateRejectArtwork,
  adminController.rejectArtwork
);

router.get("/artworks", validateArtworksQuery, adminController.getAllArtworks);

// statistics router
router.get("/stats/artworks", adminController.getArtworkStats);
router.get("/stats/users", adminController.getUserStats);

// User management routes
router.get("/users", validateUsersQuery, adminController.getAllUsers);

// Transaction management routes
router.get(
  "/transactions",
  validateTransactionsQuery,
  adminController.getAllTransactions
);

router.get("/messages/analytics", adminController.getMessageAnalytics);
router.get("/messages", adminController.getAllMessages);
router.get(
  "/messages/conversation/:conversationId",
  adminController.getConversationDetails
);
router.patch("/messages/:messageId/flag", adminController.toggleMessageFlag);
router.delete("/messages/:messageId", adminController.adminDeleteMessage);

// Traceability overview
router.get("/traceability/overview", adminController.getTraceabilityOverview);

module.exports = router;
