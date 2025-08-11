const mongoose = require("mongoose");

const listingPaymentSchema = new mongoose.Schema(
  {
    artist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    artwork: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artwork",
      required: true,
    },
    paymentIntent: {
      type: String,
      required: true,
    },
    sessionId: {
      type: String,
      select: false, // Don't return in normal queries for security
    },
    amount: {
      type: Number,
      default: 100, // €1 in cents
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    paidAt: Date,
    metadata: {
      stripe_payment_method: String,
      stripe_receipt_url: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster searches
listingPaymentSchema.index({ artist: 1, artwork: 1 });

const ListingPayment = mongoose.model("ListingPayment", listingPaymentSchema);

module.exports = ListingPayment;
