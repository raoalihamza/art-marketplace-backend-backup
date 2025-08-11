const Artwork = require("../models/Artwork");
const logger = require("../utils/logger");

class AnalyticsService {
  // Get top selling artists with detailed metrics
  async getTopSellingArtists(query = {}) {
    try {
      const { limit = 10, period = "all" } = query;

      // Build date filter based on period
      let dateFilter = {};
      if (period !== "all") {
        const now = new Date();
        let startDate;

        switch (period) {
          case "week":
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "month":
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case "year":
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = null;
        }

        if (startDate) {
          dateFilter.lastSaleDate = { $gte: startDate };
        }
      }

      const topArtists = await Artwork.aggregate([
        {
          $match: {
            $expr: { $ne: ["$artist", "$currentOwner"] },
            status: "approved",
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: "$artist",
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: "$price" },
            averagePrice: { $avg: "$price" },
            minPrice: { $min: "$price" },
            maxPrice: { $max: "$price" },
            uniqueOwners: { $addToSet: "$currentOwner" },
            lastSaleDate: { $max: "$lastSaleDate" },
            firstSaleDate: { $min: "$lastSaleDate" },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "artistInfo",
            pipeline: [
              {
                $project: {
                  username: 1,
                  email: 1,
                  profile: 1,
                  createdAt: 1,
                },
              },
            ],
          },
        },
        { $unwind: "$artistInfo" },
        {
          $project: {
            artistId: "$_id",
            artist: "$artistInfo",
            totalSales: 1,
            totalRevenue: 1,
            averagePrice: { $round: ["$averagePrice", 2] },
            minPrice: 1,
            maxPrice: 1,
            uniqueBuyers: { $size: "$uniqueOwners" },
            lastSaleDate: 1,
            firstSaleDate: 1,
            salesVelocity: {
              $cond: [
                { $and: ["$lastSaleDate", "$firstSaleDate"] },
                {
                  $divide: [
                    "$artworksSold",
                    {
                      $divide: [
                        { $subtract: ["$lastSaleDate", "$firstSaleDate"] },
                        1000 * 60 * 60 * 24, // Convert to days
                      ],
                    },
                  ],
                },
                0,
              ],
            },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: parseInt(limit) },
      ]);

      return {
        topArtists,
        period,
        totalFound: topArtists.length,
      };
    } catch (error) {
      logger.error("Error getting top selling artists:", error);
      throw error;
    }
  }

  // Get top selling artworks with detailed metrics
  async getTopSellingArtworks(query = {}) {
    try {
      const { limit = 10, period = "all", category } = query;

      // Build date filter
      let dateFilter = {};

      if (period !== "all") {
        const now = new Date();
        let startDate;

        switch (period) {
          case "week":
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "month":
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case "year":
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = null;
        }

        if (startDate) {
          dateFilter.lastSaleDate = { $gte: startDate };
        }
      }

      // Build category filter
      let categoryFilter = {};

      if (category) {
        categoryFilter.medium = { $regex: category, $options: "i" };
      }

      const topArtworks = await Artwork.find({
        $expr: { $ne: ["$artist", "$currentOwner"] },
        status: "approved",
        ...dateFilter,
        ...categoryFilter,
      })
        .populate("artist", "username email profile")
        .populate("currentOwner", "username email")
        .sort({
          totalSales: -1,
          price: -1,
          lastSaleDate: -1,
        })
        .limit(parseInt(limit))
        .lean();

      return {
        topArtworks,
        period,
        category: category || "all",
        totalFound: topArtworks.length,
      };
    } catch (error) {
      logger.error("Error getting top selling artworks:", error);
      throw error;
    }
  }

  // Get top selling categories
  async getTopSellingCategories(query = {}) {
    try {
      const { limit = 10, period = "all" } = query;

      // Build date filter
      let dateFilter = {};
      if (period !== "all") {
        const now = new Date();
        let startDate;

        switch (period) {
          case "week":
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "month":
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case "year":
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = null;
        }

        if (startDate) {
          dateFilter.lastSaleDate = { $gte: startDate };
        }
      }

      const topCategories = await Artwork.aggregate([
        {
          $match: {
            $expr: { $ne: ["$artist", "$currentOwner"] },
            status: "approved",
            medium: {
              $exists: true,
              $ne: null,
              $ne: "",
              $type: "string",
            },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: "$medium",
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: "$price" },
            averagePrice: { $avg: "$price" },
            uniqueArtists: { $addToSet: "$artist" },
            uniqueBuyers: { $addToSet: "$currentOwner" },
            lastSaleDate: { $max: "$lastSaleDate" },
            highestPriceSold: { $max: "$price" },
            lowestPriceSold: { $min: "$price" },
          },
        },
        {
          $project: {
            category: "$_id",
            totalSales: 1,
            totalRevenue: 1,
            averagePrice: { $round: ["$averagePrice", 2] },
            uniqueArtists: { $size: "$uniqueArtists" },
            uniqueBuyers: { $size: "$uniqueBuyers" },
            lastSaleDate: 1,
            highestPriceSold: 1,
            lowestPriceSold: 1,
          },
        },
        { $sort: { totalRevenue: -1, totalSales: -1 } },
        { $limit: parseInt(limit) },
      ]);

      return {
        topCategories,
        period,
        totalFound: topCategories.length,
      };
    } catch (error) {
      logger.error("Error getting top selling categories:", error);
      throw error;
    }
  }

  // Generate comprehensive analytics report
  async generateAnalyticsReport(query = {}) {
    try {
      const { period = "month" } = query;

      const [topArtists, topArtworks, topCategories] = await Promise.all([
        this.getTopSellingArtists({ limit: 5, period }),
        this.getTopSellingArtworks({ limit: 5, period }),
        this.getTopSellingCategories({ limit: 5, period }),
      ]);

      return {
        reportGenerated: new Date(),
        period,
        topArtists,
        topArtworks,
        topCategories,
      };
    } catch (error) {
      logger.error("Error generating analytics report:", error);
      throw error;
    }
  }

  // ✅ New method for ownership analytics
  async getOwnershipAnalytics(query = {}) {
    try {
      const { period = "all" } = query;

      // Build date filter
      let dateFilter = {};
      if (period !== "all") {
        const now = new Date();
        let startDate;

        switch (period) {
          case "week":
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "month":
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case "year":
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = null;
        }

        if (startDate) {
          dateFilter.lastSaleDate = { $gte: startDate };
        }
      }

      // Ownership transfer analytics
      const ownershipData = await Artwork.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalArtworks: { $sum: 1 },
            originalOwnership: {
              $sum: {
                $cond: [{ $eq: ["$artist", "$currentOwner"] }, 1, 0],
              },
            },
            transferredOwnership: {
              $sum: {
                $cond: [{ $ne: ["$artist", "$currentOwner"] }, 1, 0],
              },
            },
            averageTransfers: {
              $avg: { $size: { $ifNull: ["$ownershipHistory", []] } },
            },
          },
        },
      ]);

      // Most active secondary market artworks
      const secondaryMarketArtworks = await Artwork.find({
        $expr: { $gt: [{ $size: { $ifNull: ["$ownershipHistory", []] } }, 1] },
      })
        .populate("artist", "username")
        .populate("currentOwner", "username")
        .sort({ "ownershipHistory.length": -1 })
        .limit(10)
        .lean();

      return {
        period,
        ownershipSummary: ownershipData[0] || {
          totalArtworks: 0,
          originalOwnership: 0,
          transferredOwnership: 0,
          averageTransfers: 0,
        },
        secondaryMarketArtworks,
        transferRate: ownershipData[0]
          ? (
              (ownershipData[0].transferredOwnership /
                ownershipData[0].totalArtworks) *
              100
            ).toFixed(2)
          : 0,
      };
    } catch (error) {
      logger.error("Error getting ownership analytics:", error);
      throw error;
    }
  }
}

module.exports = new AnalyticsService();
