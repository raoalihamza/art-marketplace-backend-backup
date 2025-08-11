const mongoose = require("mongoose");

const traceabilityRecordSchema = new mongoose.Schema(
  {
    artworkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artwork",
      required: true,
    },
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    transactionType: {
      type: String,
      enum: ["created", "sold", "transferred"],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    transactionHash: {
      type: String,
      unique: true,
      required: true,
    },
    additionalData: {
      price: Number,
      location: String,
      notes: String,
      condition: String,
      certificate: Object,
      paymentIntent: String,
      saleDate: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster searches
traceabilityRecordSchema.index({ artworkId: 1, timestamp: 1 });
traceabilityRecordSchema.index({ fromUserId: 1, toUserId: 1 });

// Static method to generate a unique transaction hash
traceabilityRecordSchema.statics.generateTransactionHash = function (data) {
  // In a real application, you might use a cryptographic function
  // For now, just create a simple unique hash based on timestamp and ids
  const timestamp = Date.now().toString();
  const random = Math.random().toString().substring(2, 8);
  return `tr-${timestamp}-${random}`;
};

const TraceabilityRecord = mongoose.model(
  "TraceabilityRecord",
  traceabilityRecordSchema
);

module.exports = TraceabilityRecord;
