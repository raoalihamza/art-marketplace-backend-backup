const express = require("express");
const paymentController = require("../controllers/paymentController");
const { protect, restrictTo } = require("../middleware/auth");
const {
  // validateCreateListingSession,
  validateCreatePurchaseSession,
  validatePaymentHistoryQuery,
  validateTransactionId,
} = require("../validators/paymentValidator");

const router = express.Router();

// Protected routes (authentication required)
router.use(protect);

/*
// TEMPORARILY DISABLED: Listing fee requirement
router.post(
  "/create-listing-session",
  restrictTo("artist"),
  validateCreateListingSession,
  paymentController.createListingSession
);
*/

router.post(
  "/create-purchase-session",
  validateCreatePurchaseSession,
  paymentController.createPurchaseSession
);

// Payment history and details
router.get(
  "/history",
  validatePaymentHistoryQuery,
  paymentController.getPaymentHistory
);

router.get(
  "/transaction/:id",
  validateTransactionId,
  paymentController.getTransaction
);

// Payment statistics
router.get("/stats", paymentController.getPaymentStats);

module.exports = router;

// Export webhook handler separately for direct mounting
module.exports.webhookHandler = [
  express.raw({ type: "application/json" }),
  paymentController.handleWebhook,
];
