const Transaction = require("../models/Transaction");
const paymentService = require("../services/paymentService");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

/*

// TEMPORARILY DISABLED: Listing fee requirement
// Create listing payment session
const createListingSession = async (req, res, next) => {
  try {
    if (req.user.role !== "artist") {
      return next(new AppError("Only artists can pay listing fees", 403));
    }

    const { artworkId } = req.body;
    const result = await paymentService.createListingPaymentSession(
      artworkId,
      req.user.id
    );

    res.status(200).json({
      status: "success",
      message: "Payment session created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

*/

// Create purchase payment session
const createPurchaseSession = async (req, res, next) => {
  try {
    const { artworkId } = req.body;
    const result = await paymentService.createPurchasePaymentSession(
      artworkId,
      req.user.id
    );

    res.status(200).json({
      status: "success",
      message: "Purchase session created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Handle Stripe webhook
const handleWebhook = async (req, res, next) => {
  const sig = req.headers["stripe-signature"];
  const { stripe, paymentConfig } = require("../config/stripe");

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      paymentConfig.webhookEndpointSecret
    );

    logger.info(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case "payment_intent.succeeded":
        await paymentService.handlePaymentSuccess(event.data.object);
        break;
      case "payment_intent.payment_failed":
        logger.warn(`Payment failed: ${event.data.object.id}`);
        // Update transaction status to failed
        await Transaction.updateOne(
          { paymentIntent: event.data.object.id },
          { status: "failed" }
        );
        break;
      default:
        logger.info(`Unhandled webhook event: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error("Webhook error:", error);
    next(new AppError("Webhook processing failed", 400));
  }
};

// Get payment history
const getPaymentHistory = async (req, res, next) => {
  try {
    const result = await paymentService.getPaymentHistory(
      req.user.id,
      req.query
    );

    res.status(200).json({
      status: "success",
      results: result.transactions.length,
      data: {
        transactions: result.transactions,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get transaction details
const getTransaction = async (req, res, next) => {
  try {
    const transaction = await paymentService.getTransactionById(
      req.params.id,
      req.user.id
    );

    res.status(200).json({
      status: "success",
      data: {
        transaction,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get payment statistics
const getPaymentStats = async (req, res, next) => {
  try {
    const stats = await paymentService.getPaymentStats(req.user.id);

    res.status(200).json({
      status: "success",
      data: {
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // TEMPORARILY DISABLED: Listing fee requirement
  // createListingSession,
  createPurchaseSession,
  handleWebhook,
  getPaymentHistory,
  getTransaction,
  getPaymentStats,
};
