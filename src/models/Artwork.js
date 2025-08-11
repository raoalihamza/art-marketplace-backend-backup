const mongoose = require("mongoose");

const artworkSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price must be at least 0"],
    },
    images: {
      type: [String],
      required: [true, "At least one image is required"],
    },
    artist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Artist is required"],
    },

    listingFeeStatus: {
      type: String,
      enum: ["unpaid", "pending", "paid", "failed"],
      default: "unpaid",
    },
    listingFeePaymentIntent: {
      type: String, // Store Stripe payment intent ID
      default: null,
    },
    listingFeePaidAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },

    approvedAt: Date,
    rejectedAt: Date,
    rejectionReason: {
      type: String,
      trim: true,
    },

    ownershipHistory: [
      {
        owner: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        purchaseDate: {
          type: Date,
          default: Date.now,
        },
        price: Number,
        transactionId: String,
        fromOwner: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    lastSaleDate: Date,
    totalSales: {
      type: Number,
      default: 0,
    },
    currentOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: function () {
        return this.artist;
      },
    },

    tags: [String],
    medium: String,
    dimensions: {
      width: Number,
      height: Number,
      unit: {
        type: String,
        enum: ["cm", "in"],
        default: "cm",
      },
    },
    year: Number,
    isOriginal: {
      type: Boolean,
      default: true,
    },
    edition: {
      number: Number,
      total: Number,
    },
    // Engagement metrics
    engagementStats: {
      totalLikes: {
        type: Number,
        default: 0,
      },
      totalViews: {
        type: Number,
        default: 0,
      },
      lastLikedAt: {
        type: Date,
      },
      popularityScore: {
        type: Number,
        default: 0,
      },
    },
    // Users who liked this artwork (for quick lookup)
    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Static method to increment view count
artworkSchema.statics.incrementViewCount = async function (artworkId) {
  const artwork = await this.findByIdAndUpdate(
    artworkId,
    {
      $inc: { "engagementStats.totalViews": 1 },
      $set: {
        "engagementStats.popularityScore": {
          $add: [
            { $multiply: ["$engagementStats.totalLikes", 2] },
            { $add: ["$engagementStats.totalViews", 1] },
          ],
        },
      },
    },
    { new: true }
  );
  return artwork;
};

// Static method to get popular artworks
artworkSchema.statics.getPopularArtworks = function (limit = 10) {
  return this.find({ status: "approved" })
    .sort({
      "engagementStats.popularityScore": -1,
      "engagementStats.totalLikes": -1,
    })
    .limit(limit)
    .populate("artist", "username profile")
    .populate("currentOwner", "username profile");
};

// Instance method to check if user has liked this artwork
artworkSchema.methods.isLikedByUser = function (userId) {
  return this.likedBy && this.likedBy.includes(userId);
};

// Index for faster searches
artworkSchema.index({ title: "text", description: "text", tags: "text" });
artworkSchema.index({ status: 1, createdAt: -1 });
artworkSchema.index({ artist: 1, status: 1 });

// Index for engagement queries
artworkSchema.index({ "engagementStats.totalLikes": -1 });
artworkSchema.index({ "engagementStats.popularityScore": -1 });
artworkSchema.index({ "engagementStats.totalViews": -1 });
artworkSchema.index({ likedBy: 1 });

// Virtual for artwork traceability history
artworkSchema.virtual("traceabilityHistory", {
  ref: "TraceabilityRecord",
  foreignField: "artworkId",
  localField: "_id",
});

const Artwork = mongoose.model("Artwork", artworkSchema);

module.exports = Artwork;
