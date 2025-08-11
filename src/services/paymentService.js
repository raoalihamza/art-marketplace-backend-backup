const {
  stripe,
  paymentConfig,
  getSessionOptions,
} = require("../config/stripe");
const Artwork = require("../models/Artwork");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const ListingPayment = require("../models/ListingPayment");
const TraceabilityRecord = require("../models/TraceabilityRecord");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");
const {
  addPaymentConfirmationJob,
  addFailedPaymentJob,
} = require("../jobs/paymentJobs");
const { default: mongoose } = require("mongoose");

class PaymentService {
  // create stripe customer if doesn't exist
  async ensureStripeCustomer(user) {
    try {
      if (user.stripeCustomerId) {
        // verify customer still exitsts in Stripe
        try {
          await stripe.customers.retrieve(user.stripeCustomerId);
          return user.stripeCustomerId;
        } catch (error) {
          logger.warn(
            `Strip customer ${user.stripeCustomerId} not found, creating new one`
          );
        }
      }

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.username,
        metadata: {
          userId: user._id.toString(),
          role: user.role,
        },
      });

      // Update user with Stripe customer ID
      await User.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });

      return customer.id;
    } catch (error) {
      logger.error("Error ensuring Stripe customer:", error);
      throw new AppError("Failed to create payment customer", 500);
    }
  }

  /*

  // TEMPORARILY DISABLED: Listing fee requirement
  // Create listing fee payment session
  async createListingPaymentSession(artworkId, userId) {
    try {
      // verify artworks exists and belongs to user
      const artwork = await Artwork.findById(artworkId);
      if (!artwork) {
        throw new AppError("Artwork not found", 404);
      }

      if (artwork.artist.toString() !== userId) {
        throw new AppError(
          "You can only pay listing fees for your own artwork",
          403
        );
      }

      // Check if already paid
      if (artwork.listingFeeStatus === "paid") {
        throw new AppError("Listing fee already paid for this artwork", 400);
      }

      if (artwork.listingFeeStatus === "pending") {
        throw new AppError(
          "Payment session already in progress. Please complete or wait for current session to expire.",
          400
        );
      }

      // Get user and ensure Stripe customer
      const user = await User.findById(userId);
      const customerId = await this.ensureStripeCustomer(user);

      // create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: paymentConfig.listingFee.amount,
        currency: paymentConfig.listingFee.currency,
        customer: customerId,
        description: `${paymentConfig.listingFee.description} - ${artwork.title}`,
        metadata: {
          type: "listing_fee",
          artworkId: artworkId.toString(),
          userId: userId,
          artworkTitle: artwork.title,
        },
      });

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        ...getSessionOptions(customerId, {
          type: "listing_fee",
          artworkId: artworkId.toString(),
          userId: userId,
        }),
        line_items: [
          {
            price_data: {
              currency: paymentConfig.listingFee.currency,
              product_data: {
                name: "Artwork Listing Fee",
                description: `List "${artwork.title}" on 3rd Hand Art Marketplace`,
                images: artwork.images.slice(0, 1), // First image only
              },
              unit_amount: paymentConfig.listingFee.amount,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          metadata: paymentIntent.metadata,
        },
      });

      // Update artwork payment status when session is created
      artwork.listingFeeStatus = "pending";
      artwork.listingFeePaymentIntent = paymentIntent.id;
      await artwork.save();

      // Record listing payment in database
      await ListingPayment.create({
        artist: userId,
        artwork: artworkId,
        paymentIntent: paymentIntent.id,
        sessionId: session.id,
        amount: paymentConfig.listingFee.amount,
        status: "pending",
      });

      // Record transaction
      await Transaction.create({
        seller: userId,
        artwork: artworkId,
        amount: paymentConfig.listingFee.amount,
        paymentIntent: paymentIntent.id,
        status: "pending",
        transactionType: "listing_fee",
        metadata: {
          stripe_session_id: session.id,
          artwork_title: artwork.title,
        },
      });

      logger.info(
        `Listing payment session created for artwork ${artworkId} by user ${userId}`
      );

      return {
        sessionId: session.id,
        sessionUrl: session.url,
        paymentIntentId: paymentIntent.id,
      };
    } catch (error) {
      logger.error("Error creating listing payment session:", error);
      throw error;
    }
  }

  */

  // Create purchase payment session
  async createPurchasePaymentSession(artworkId, buyerId) {
    // Use atomic transaction to prevent race conditions
    const mongoSession = await mongoose.startSession();

    try {
      mongoSession.startTransaction();

      // Verify artwork exists and is available for purchase with session lock
      const artwork = await Artwork.findById(artworkId)
        .populate("artist")
        .populate("currentOwner")
        .session(mongoSession);

      if (!artwork) {
        throw new AppError("Artwork not found", 404);
      }

      if (artwork.status !== "approved") {
        throw new AppError("Artwork is not available for purchase", 400);
      }

      if (artwork.currentOwner._id.toString() === buyerId) {
        throw new AppError("You cannot purchase artwork you already own", 400);
      }

      // Check for non-expired pending transactions within atomic operation
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // Clean up expired transactions first
      await Transaction.updateMany(
        {
          artwork: artworkId,
          status: "pending",
          $or: [
            { expiresAt: { $lt: now } },
            {
              createdAt: { $lt: fiveMinutesAgo },
              expiresAt: { $exists: false },
            },
          ],
        },
        {
          status: "failed",
          metadata: {
            failureReason: "Session expired or abandoned",
            cleanedUpAt: now,
          },
        }
      ).session(mongoSession);

      // Check for active pending transactions
      const activePendingTransaction = await Transaction.findOne({
        artwork: artworkId,
        status: "pending",
        $or: [
          { expiresAt: { $gt: now } },
          {
            createdAt: { $gt: fiveMinutesAgo },
            expiresAt: { $exists: false },
          },
        ],
      }).session(mongoSession);

      if (activePendingTransaction) {
        const timeLeft = activePendingTransaction.expiresAt
          ? Math.max(
              0,
              Math.ceil((activePendingTransaction.expiresAt - now) / 1000 / 60)
            )
          : 30;

        throw new AppError(
          `This artwork is currently being purchased by another user. Please try again in ${timeLeft} minutes.`,
          409
        );
      }

      // Get buyer and ensure Stripe Customer
      const buyer = await User.findById(buyerId);
      const customerId = await this.ensureStripeCustomer(buyer);

      // Use currentOwner as seller, not original artist
      const currentOwner = artwork.currentOwner;
      const sellerId = currentOwner._id.toString();

      // Calculate platform commission (5% for example)
      // const platformCommission = Math.round(artwork.price * 0.05);
      const platformCommission = 0; // Temporarily no commission for sales
      const artistAmount = artwork.price - platformCommission;

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: artwork.price * 100, // Convert to cents
        currency: "eur",
        customer: customerId,
        description: `Purchase: ${artwork.title} by ${artwork.artist.username}`,
        metadata: {
          type: "sale",
          artworkId: artworkId.toString(),
          buyerId: buyerId,
          sellerId: sellerId,
          platformCommission: platformCommission.toString(),
          artistAmount: artistAmount.toString(),
          isResale:
            artwork.artist._id.toString() !== sellerId ? "true" : "false",
          original_artist: artwork.artist._id.toString(),
        },
      });

      // Create checkout session with expiry
      const sessionExpiryTime = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes (minimumum Stripe session expiry)
      const session = await stripe.checkout.sessions.create({
        ...getSessionOptions(customerId, {
          type: "sale",
          artworkId: artworkId.toString(),
          buyerId: buyerId,
          sellerId: sellerId,
        }),
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: artwork.title,
                description: `Original artwork by ${artwork.artist.username}`,
                images: artwork.images.slice(0, 1),
              },
              unit_amount: artwork.price * 100,
            },
            quantity: 1,
          },
        ],
        expires_at: sessionExpiryTime,
        payment_intent_data: {
          metadata: paymentIntent.metadata,
        },
      });

      // Create transaction with expiry within atomic operation
      const transactionExpiry = new Date(Date.now() + 30 * 60 * 1000);
      await Transaction.create(
        [
          {
            buyer: buyerId,
            seller: sellerId,
            artwork: artworkId,
            amount: artwork.price * 100,
            paymentIntent: paymentIntent.id,
            status: "pending",
            transactionType: "sale",
            expiresAt: transactionExpiry,
            metadata: {
              stripe_session_id: session.id,
              stripe_expires_at: sessionExpiryTime,
              platform_commission: platformCommission,
              artist_amount: artistAmount,
            },
          },
        ],
        { session: mongoSession }
      );

      // Commit the atomic transaction
      await mongoSession.commitTransaction();

      logger.info(
        `Purchase payment session created for artwork ${artworkId} by buyer ${buyerId}`
      );

      return {
        sessionId: session.id,
        sessionUrl: session.url,
        paymentIntentId: paymentIntent.id,
        expiresAt: transactionExpiry,
      };
    } catch (error) {
      logger.error("Error creating purchase payment session,", error);
      throw error;
    } finally {
      mongoSession.endSession();
    }
  }

  // Handle successful payment webhook
  async handlePaymentSuccess(paymentIntent) {
    try {
      const { type, artworkId, userId, buyerId, sellerId } =
        paymentIntent.metadata;

      if (type === "listing_fee") {
        // TEMPORARILY DISABLED: Listing fee requirement
        // await this.handleListingFeeSuccess(paymentIntent, artworkId, userId);
      } else if (type === "sale") {
        await this.handleSaleSuccess(
          paymentIntent,
          artworkId,
          buyerId,
          sellerId
        );
      }

      logger.info(`Payment success handled for ${type}: ${paymentIntent.id}`);
    } catch (error) {
      logger.error("Error handling payment success:", error);
      throw error;
    }
  }

  /*
  // TEMPORARILY DISABLED: Listing fee requirement
  // Handle listing fee payment success
  async handleListingFeeSuccess(paymentIntent, artworkId, userId) {
    try {
      // Update artwork payment status first
      await Artwork.updateOne(
        { _id: artworkId },
        {
          listingFeeStatus: "paid",
          listingFeePaidAt: new Date(),
        }
      );

      // Update ListingPayment status
      await ListingPayment.updateOne(
        {
          artist: userId,
          artwork: artworkId,
          status: "pending",
        },
        {
          status: "completed",
          paidAt: new Date(),
          metadata: {
            stripe_payment_method: paymentIntent.payment_method,
            stripe_receipt_url:
              paymentIntent.charges?.data?.[0]?.receipt_url || null,
          },
        }
      );

      // Update transaction status
      await Transaction.updateOne(
        {
          seller: userId,
          artwork: artworkId,
          status: "pending",
        },
        {
          status: "completed",
          metadata: {
            ...paymentIntent.metadata,
            stripe_payment_method: paymentIntent.payment_method,
            stripe_receipt_url:
              paymentIntent.charges?.data?.[0]?.receipt_url || null,
          },
        }
      );

      // Create traceability record now that payment is confirmed
      const transactionHash = TraceabilityRecord.generateTransactionHash();
      await TraceabilityRecord.create({
        artworkId,
        fromUserId: userId,
        toUserId: userId,
        transactionType: "created",
        transactionHash,
        additionalData: {
          price: (await Artwork.findById(artworkId)).price,
          condition: "new",
          paymentIntent: paymentIntent.id,
          listingFeePaid: true,
        },
      });

      // payment confirmation job
      const transaction = await Transaction.findOne({
        paymentIntent: paymentIntent.id,
      });

      if (transaction) {
        await addPaymentConfirmationJob(transaction._id, "listing_fee");
      }

      // Artwork remains pending until admin approval
      logger.info(`Listing fee payment completed for artwork ${artworkId}`);
    } catch (error) {
      // Handle payment failure
      await Artwork.updateOne(
        { _id: artworkId },
        { listingFeeStatus: "failed" }
      );

      logger.error("Error handling listing fee success:", error);
      throw error;
    }
  }
  */

  /*
  // TEMPORARILY DISABLED: Listing fee requirement
  // OPTIONAL: method to handle payment failures
  async handleListingFeeFailure(paymentIntent, artworkId, userId, reason) {
    try {
      await Artwork.updateOne(
        { _id: artworkId },
        { listingFeeStatus: "failed" }
      );

      await ListingPayment.updateOne(
        {
          artist: userId,
          artwork: artworkId,
          paymentIntent: paymentIntent.id,
        },
        { status: "failed" }
      );

      await Transaction.updateOne(
        {
          seller: userId,
          artwork: artworkId,
          paymentIntent: paymentIntent.id,
        },
        { status: "failed" }
      );

      logger.info(
        `Listing fee payment failed for artwork ${artworkId}: ${reason}`
      );
    } catch (error) {
      logger.error("Error handling listing fee failure:", error);
    }
  }
  */

  // Handle sale payment success
  async handleSaleSuccess(paymentIntent, artworkId, buyerId, sellerId) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // Update transaction status (within transaction)
      await Transaction.updateOne(
        {
          seller: sellerId,
          artwork: artworkId,
          status: "pending",
        },
        {
          status: "completed",
          metadata: {
            ...paymentIntent.metadata,
            stripe_payment_method: paymentIntent.payment_method,
            stripe_receipt_url:
              paymentIntent.charges?.data?.[0]?.receipt_url || null,
          },
        },
        { session }
      );

      // Update artwork as sold (within transaction)
      const artwork = await Artwork.findByIdAndUpdate(
        artworkId,
        {
          currentOwner: buyerId,
          lastSaleDate: new Date(),
          $inc: { totalSales: 1 },
          // ownership history for tracking
          $push: {
            ownershipHistory: {
              owner: buyerId,
              purchaseDate: new Date(),
              price: parseInt(paymentIntent.amount) / 100, // Convert from cents
              transactionId: paymentIntent.id,
              fromOwner: sellerId,
            },
          },
        },
        {
          new: true,
          session,
        }
      );

      // Create traceability record for ownership transfer
      const transactionHash = TraceabilityRecord.generateTransactionHash();
      await TraceabilityRecord.create(
        [
          {
            artworkId,
            fromUserId: sellerId,
            toUserId: buyerId,
            transactionType: "sold",
            transactionHash,
            additionalData: {
              price: parseInt(paymentIntent.amount) / 100,
              paymentIntent: paymentIntent.id,
              saleDate: new Date(),
              // Additional context for resales
              isResale: paymentIntent.metadata.isResale === "true",
              originalArtist:
                paymentIntent.metadata.original_artist || artwork.artist,
              transferNumber: artwork.ownershipHistory
                ? artwork.ownershipHistory.length
                : 1,
            },
          },
        ],
        { session }
      );

      // If we reach here, all operations succeeded
      await session.commitTransaction();

      // Add payment confirmation job
      const transaction = await Transaction.findOne({
        paymentIntent: paymentIntent.id,
      });

      if (transaction) {
        await addPaymentConfirmationJob(transaction._id, "sale");
      }

      logger.info(
        `Sale completed for artwork ${artworkId}, transferred from ${sellerId} to ${buyerId}`
      );
    } catch (error) {
      // Rollback all changes if anything fails
      await session.abortTransaction();
      logger.error("Error handling purchase payment success:", error);

      // Add failed payment job
      const transaction = await Transaction.findOne({
        paymentIntent: paymentIntent.id,
      });

      if (transaction) {
        await addFailedPaymentJob(
          transaction._id,
          "Payment processing failed due to database error"
        );
      }

      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get payment history for user
  async getPaymentHistory(userId, query = {}) {
    try {
      const { page = 1, limit = 10, type = "all", status = "all" } = query;

      // Build filter
      const filter = {
        $or: [{ buyer: userId }, { seller: userId }],
      };

      if (type !== "all") {
        filter.transactionType = type;
      }

      if (status !== "all") {
        filter.status = status;
      }

      const skip = (page - 1) * limit;

      const transactions = await Transaction.find(filter)
        .populate("artwork", "title images price")
        .populate("buyer", "username")
        .populate("seller", "username")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await Transaction.countDocuments(filter);

      return {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: skip + limit < total,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      logger.error("Error getting payment history:", error);
      throw error;
    }
  }

  // Get transaction by ID
  async getTransactionById(transactionId, userId) {
    try {
      const transaction = await Transaction.findById(transactionId)
        .populate("artwork", "title images price")
        .populate("buyer", "username email")
        .populate("seller", "username email")
        .lean();

      if (!transaction) {
        throw new AppError("Transaction not found", 404);
      }

      // Check if user is involved in this transaction
      const isInvolved =
        transaction.buyer?._id.toString() === userId ||
        transaction.seller._id.toString() === userId;

      if (!isInvolved) {
        throw new AppError(
          "You do not have permission to view this transaction",
          403
        );
      }

      return transaction;
    } catch (error) {
      logger.error("Error getting transaction by ID:", error);
      throw error;
    }
  }

  // Get payment statistics for user
  async getPaymentStats(userId) {
    try {
      const stats = await Transaction.aggregate([
        {
          $match: {
            $or: [
              { buyer: new mongoose.Types.ObjectId(userId) },
              { seller: new mongoose.Types.ObjectId(userId) },
            ],
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalSpent: {
              $sum: {
                $cond: [
                  { $eq: ["$buyer", new mongoose.Types.ObjectId(userId)] },
                  "$amount",
                  0,
                ],
              },
            },
            totalEarned: {
              $sum: {
                $cond: [
                  { $eq: ["$seller", new mongoose.Types.ObjectId(userId)] },
                  "$amount",
                  0,
                ],
              },
            },
            salesCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$seller", new mongoose.Types.ObjectId(userId)] },
                      { $eq: ["$transactionType", "sale"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            purchasesCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$buyer", new mongoose.Types.ObjectId(userId)] },
                      { $eq: ["$transactionType", "sale"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            listingFeesCount: {
              $sum: {
                $cond: [{ $eq: ["$transactionType", "listing_fee"] }, 1, 0],
              },
            },
          },
        },
      ]);

      return (
        stats[0] || {
          totalTransactions: 0,
          totalSpent: 0,
          totalEarned: 0,
          salesCount: 0,
          purchasesCount: 0,
          listingFeesCount: 0,
        }
      );
    } catch (error) {
      logger.error("Error getting payment stats:", error);
      throw error;
    }
  }
}

module.exports = new PaymentService();
