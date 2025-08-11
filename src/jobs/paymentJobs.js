const Queue = require("bull");
const config = require("../config/config");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const emailService = require("../services/emailService");
const logger = require("../utils/logger");
const { stripe } = require("../config/stripe");

// create payment queue
const paymentQueue = new Queue("payment processing", {
  redis: {
    port: config.redis.port || 6379,
    host: config.redis.host || "localhost",
  },
});

// Process payment confirmation emails
paymentQueue.process("send-payment-confirmation", async (job) => {
  const { transactionId, type } = job.data;

  try {
    logger.info(
      `Processing payment confirmation email for transaction: ${transactionId}`
    );

    const transaction = await Transaction.findById(transactionId)
      .populate("artwork", "title images")
      .populate("buyer", "email username")
      .populate("seller", "email username");

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    if (type === "listing_fee") {
      // Send listing fee confirmation to artist
      await emailService.sendListingFeeConfirmation(
        transaction.seller.email,
        transaction.seller.username,
        transaction.artwork.title,
        transaction.amount / 100 // Convert cents to euros
      );
    } else if (type === "sale") {
      // Send purchase confirmation to buyer
      await emailService.sendPurchaseConfirmation(
        transaction.buyer.email,
        transaction.buyer.username,
        transaction.artwork.title,
        transaction.amount / 100
      );

      // Send sale notification to seller
      await emailService.sendSaleNotification(
        transaction.seller.email,
        transaction.seller.username,
        transaction.artwork.title,
        transaction.amount / 100
      );
    }

    logger.info(
      `Payment confirmation emails sent for transaction: ${transactionId}`
    );

    return { success: true, transactionId, type };
  } catch (error) {
    logger.error(
      `Payment confirmation email failed for transaction ${transactionId}:`,
      error
    );
    throw error;
  }
});

// Process failed payment handling
paymentQueue.process("handle-failed-payment", async (job) => {
  const { paymentIntentId, reason } = job.data;

  try {
    logger.info(`Processing failed payment: ${paymentIntentId}`);

    const transaction = await Transaction.findOne({
      paymentIntent: paymentIntentId,
    })
      .populate("artwork", "title")
      .populate("seller", "email username")
      .populate("buyer", "email username");

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // Update transaction status
    transaction.status = "failed";
    transaction.metadata = {
      ...transaction.metadata,
      failureReason: reason,
      failedAt: new Date(),
    };
    await transaction.save();

    // Send failure notification
    const userEmail = transaction.buyer?.email || transaction.seller.email;
    const username = transaction.buyer?.username || transaction.seller.username;

    await emailService.sendPaymentFailedNotification(
      userEmail,
      username,
      transaction.artwork.title,
      transaction.transactionType
    );

    logger.info(`Failed payment handled: ${paymentIntentId}`);

    return { success: true, paymentIntentId };
  } catch (error) {
    logger.error(
      `Failed payment handling error for ${paymentIntentId}:`,
      error
    );
    throw error;
  }
});

paymentQueue.process("cleanup-expired-transactions", async (job) => {
  try {
    logger.info("Starting cleanup of expired transactions");

    const now = new Date();

    // Find expired pending transactions
    const expiredTransactions = await Transaction.find({
      status: "pending",
      $or: [
        { expiresAt: { $lt: now } },
        {
          createdAt: { $lt: new Date(now.getTime() - 30 * 60 * 1000) },
          expiresAt: { $exists: false },
        },
      ],
    }).populate("artwork", "title");

    let cleanedCount = 0;

    for (const transaction of expiredTransactions) {
      try {
        // Double-check with Stripe if session ID exists
        if (transaction.metadata?.stripe_session_id) {
          const session = await stripe.checkout.sessions.retrieve(
            transaction.metadata.stripe_session_id
          );

          if (session.status === "expired") {
            await Transaction.updateOne(
              { _id: transaction._id },
              {
                status: "failed",
                sessionExpired: true,
                cleanedUpAt: now,
                cleanupReason:
                  "Stripe session expired - user abandoned payment",
                $set: {
                  "metadata.stripe_session_status": session.status,
                  "metadata.cleanup_timestamp": now.toISOString(),
                },
              }
            );

            cleanedCount++;
            logger.info(
              `Cleaned up expired transaction ${transaction._id} for artwork: ${transaction.artwork?.title}`
            );
          }
        } else {
          // No Stripe session - mark as failed
          await Transaction.updateOne(
            { _id: transaction._id },
            {
              status: "failed",
              cleanedUpAt: now,
              cleanupReason: "No Stripe session found - invalid transaction",
            }
          );
          cleanedCount++;
        }
      } catch (stripeError) {
        logger.error(`Error checking Stripe session: ${stripeError.message}`);

        // If very old (>1 hour), mark as failed anyway
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        if (transaction.createdAt < oneHourAgo) {
          await Transaction.updateOne(
            { _id: transaction._id },
            {
              status: "failed",
              cleanedUpAt: now,
              cleanupReason: "Assumed expired - very old transaction",
            }
          );
          cleanedCount++;
        }
      }
    }

    logger.info(
      `Cleanup completed. Processed ${cleanedCount} expired transactions`
    );

    return {
      success: true,
      totalExpired: expiredTransactions.length,
      cleanedUp: cleanedCount,
    };
  } catch (error) {
    logger.error("Transaction cleanup job failed:", error);
    throw error;
  }
});

// Add job functions
const addPaymentConfirmationJob = (transactionId, type) => {
  return paymentQueue.add(
    "send-payment-confirmation",
    { transactionId, type },
    {
      attempts: 3,
      delay: 2000,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    }
  );
};

const addFailedPaymentJob = (paymentIntentId, reason) => {
  return paymentQueue.add(
    "handle-failed-payment",
    { paymentIntentId, reason },
    {
      attempts: 2,
      delay: 5000,
    }
  );
};

// Schedule cleanup every 10 minutes
const addTransactionCleanupJob = () => {
  return paymentQueue.add(
    "cleanup-expired-transactions",
    {},
    {
      repeat: { cron: "*/10 * * * *" }, // Every 10 minutes
      attempts: 3,
    }
  );
};

// Initialize cleanup jobs
const initializePaymentJobs = async () => {
  try {
    await addTransactionCleanupJob();
    logger.info("Payment cleanup jobs initialized");
  } catch (error) {
    logger.error("Failed to initialize payment jobs:", error);
  }
};

// Error handling
paymentQueue.on("failed", (job, err) => {
  logger.error(`Payment job ${job.id} failed:`, err);
});

paymentQueue.on("completed", (job, result) => {
  logger.info(`Payment job ${job.id} completed:`, result);
});

module.exports = {
  paymentQueue,
  addPaymentConfirmationJob,
  addFailedPaymentJob,
  addTransactionCleanupJob,
  initializePaymentJobs,
};
