const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.transactionType === "sale";
      },
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    artwork: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artwork",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    paymentIntent: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    transactionType: {
      type: String,
      enum: ["listing_fee", "sale"],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      index: true, // For efficient cleanup queries
    },
    sessionExpired: {
      type: Boolean,
      default: false,
    },
    cleanedUpAt: Date,
    cleanupReason: String,
    metadata: {
      stripe_payment_id: String,
      stripe_session_id: String,
      artwork_title: String,
      receipt_url: String,
      payment_method: String,
      additional_info: Object,
      platform_commission: Number,
      artist_amount: Number,
      stripe_payment_method: String,
      stripe_receipt_url: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster searches
transactionSchema.index({ buyer: 1, seller: 1, artwork: 1, status: 1 });
transactionSchema.index({ artwork: 1, status: 1, expiresAt: 1 });

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
