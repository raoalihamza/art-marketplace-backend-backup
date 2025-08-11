const mongoose = require("mongoose");

const analyticsSchema = new mongoose.Schema(
  {
    // Platform-wide metrics
    platformStats: {
      totalUsers: {
        type: Number,
        default: 0,
      },
      totalArtists: {
        type: Number,
        default: 0,
      },
      totalBuyers: {
        type: Number,
        default: 0,
      },
      totalArtworks: {
        type: Number,
        default: 0,
      },
      totalSales: {
        type: Number,
        default: 0,
      },
      totalRevenue: {
        type: Number,
        default: 0,
      },
      totalListingFees: {
        type: Number,
        default: 0,
      },
    },

    // Daily metrics
    dailyStats: {
      date: {
        type: Date,
        required: true,
      },
      newUsers: {
        type: Number,
        default: 0,
      },
      newArtworks: {
        type: Number,
        default: 0,
      },
      salesCount: {
        type: Number,
        default: 0,
      },
      salesVolume: {
        type: Number,
        default: 0,
      },
      listingFeesCollected: {
        type: Number,
        default: 0,
      },
      activeUsers: {
        type: Number,
        default: 0,
      },
      messagesExchanged: {
        type: Number,
        default: 0,
      },
    },

    // Artist performance metrics
    artistMetrics: {
      topSellingArtists: [
        {
          artistId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          salesCount: Number,
          totalRevenue: Number,
        },
      ],
      averageArtworkPrice: Number,
    },

    // Revenue breakdown
    revenueAnalytics: {
      listingFeeRevenue: {
        type: Number,
        default: 0,
      },
      commissionRevenue: {
        type: Number,
        default: 0,
      },
      monthlyRecurringRevenue: {
        type: Number,
        default: 0,
      },
      revenueGrowthRate: {
        type: Number,
        default: 0,
      },
    },

    // Time period this analytics record covers
    period: {
      type: String,
      enum: ["daily", "weekly", "monthly", "yearly"],
      required: true,
    },

    // Date range for this analytics record
    dateRange: {
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
    },

    // When this analytics record was generated
    generatedAt: {
      type: Date,
      default: Date.now,
    },

    // Version for schema evolution
    version: {
      type: String,
      default: "1.0",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
analyticsSchema.index({ period: 1, "dateRange.startDate": 1 });
analyticsSchema.index({ "dailyStats.date": 1 });
analyticsSchema.index({ generatedAt: 1 });

// Static method to create daily analytics
analyticsSchema.statics.createDailyAnalytics = async function (date) {
  const User = mongoose.model("User");
  const Artwork = mongoose.model("Artwork");
  const Transaction = mongoose.model("Transaction");
  const Message = mongoose.model("Message");

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    // Calculate daily metrics
    const newUsersCount = await User.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });

    const newArtworksCount = await Artwork.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });

    const salesData = await Transaction.aggregate([
      {
        $match: {
          transactionType: "sale",
          status: "completed",
          timestamp: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          volume: { $sum: "$amount" },
        },
      },
    ]);

    const listingFeesData = await Transaction.aggregate([
      {
        $match: {
          transactionType: "listing_fee",
          status: "completed",
          timestamp: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const messagesCount = await Message.countDocuments({
      timestamp: { $gte: startOfDay, $lte: endOfDay },
    });

    const activeUsersCount = await Message.distinct("sender", {
      timestamp: { $gte: startOfDay, $lte: endOfDay },
    }).length;

    // Create analytics record
    const analyticsData = {
      dailyStats: {
        date: startOfDay,
        newUsers: newUsersCount,
        newArtworks: newArtworksCount,
        salesCount: salesData[0]?.count || 0,
        salesVolume: salesData[0]?.volume || 0,
        listingFeesCollected: listingFeesData[0]?.total || 0,
        activeUsers: activeUsersCount,
        messagesExchanged: messagesCount,
      },
      period: "daily",
      dateRange: {
        startDate: startOfDay,
        endDate: endOfDay,
      },
    };

    return await this.create(analyticsData);
  } catch (error) {
    throw new Error(`Failed to create daily analytics: ${error.message}`);
  }
};

// Static method to get platform overview stats
analyticsSchema.statics.getPlatformStats = async function () {
  const User = mongoose.model("User");
  const Artwork = mongoose.model("Artwork");
  const Transaction = mongoose.model("Transaction");

  try {
    const totalUsers = await User.countDocuments();
    const totalArtists = await User.countDocuments({ role: "artist" });
    const totalBuyers = await User.countDocuments({ role: "buyer" });
    const totalArtworks = await Artwork.countDocuments({ status: "approved" });

    const revenueData = await Transaction.aggregate([
      {
        $match: { status: "completed" },
      },
      {
        $group: {
          _id: "$transactionType",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const salesRevenue = revenueData.find((r) => r._id === "sale")?.total || 0;
    const listingFeeRevenue =
      revenueData.find((r) => r._id === "listing_fee")?.total || 0;
    const totalSales = revenueData.find((r) => r._id === "sale")?.count || 0;

    return {
      totalUsers,
      totalArtists,
      totalBuyers,
      totalArtworks,
      totalSales,
      totalRevenue: salesRevenue + listingFeeRevenue,
      totalListingFees: listingFeeRevenue,
    };
  } catch (error) {
    throw new Error(`Failed to get platform stats: ${error.message}`);
  }
};

const Analytics = mongoose.model("Analytics", analyticsSchema);

module.exports = Analytics;