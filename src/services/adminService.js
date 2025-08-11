const mongoose = require("mongoose");
const Artwork = require("../models/Artwork");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const ListingPayment = require("../models/ListingPayment");
const Analytics = require("../models/Analytics");
const emailService = require("./emailService");
const artworkCacheService = require("./artworkCacheService");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

class AdminService {
  // Approve artwork
  async approveArtwork(artworkId, adminId) {
    try {
      const artwork = await Artwork.findById(artworkId).populate(
        "artist",
        "email username"
      );

      if (!artwork) {
        throw new AppError("Artwork not found", 404);
      }

      if (artwork.status !== "pending") {
        throw new AppError("Artwork is not pending approval", 400);
      }

      // TEMPORARILY DISABLED: Listing fee requirement
      /*
      // Check artwork's own payment status
      if (artwork.listingFeeStatus !== "paid") {
        throw new AppError("Listing fee must be paid before approval", 400);
      }

      const listingPayment = await ListingPayment.findOne({
        artwork: artworkId,
        status: "completed",
      });

      if (!listingPayment) {
        throw new AppError("Listing fee must be paid before approval", 400);
      }
        */

      artwork.status = "approved";
      artwork.approvedAt = new Date();
      await artwork.save();

      // Invalidate cache
      await artworkCacheService.invalidateArtworkCache(artworkId);

      await this.sendArtworkApprovalEmail(
        artwork.artist.email,
        artwork.artist.username,
        artwork.title,
        artwork._id
      );

      logger.info(`Artwork ${artworkId} approved by admin ${adminId}`);

      return {
        message: "Artwork approved successfully",
        artwork: {
          id: artwork._id,
          title: artwork.title,
          status: artwork.status,
          approvedAt: artwork.approvedAt,
        },
      };
    } catch (error) {
      logger.error("Error approving artwork:", error);
      throw error;
    }
  }

  async rejectArtwork(artworkId, adminId, rejectionReason) {
    try {
      const artwork = await Artwork.findById(artworkId).populate(
        "artist",
        "email username"
      );

      if (!artwork) {
        throw new AppError("Artwork not found", 404);
      }

      if (artwork.status !== "pending") {
        throw new AppError("Artwork is not pending approval", 400);
      }

      artwork.status = "rejected";
      artwork.rejectedAt = new Date();
      artwork.rejectionReason = rejectionReason;
      await artwork.save();

      await artworkCacheService.invalidateArtworkCache(artworkId);

      await this.sendArtworkRejectionEmail(
        artwork.artist.email,
        artwork.artist.username,
        artwork.title,
        rejectionReason
      );

      logger.info(`Artwork ${artworkId} rejected by admin ${adminId}`);

      return {
        message: "Artwork rejected successfully",
        artwork: {
          id: artwork._id,
          title: artwork.title,
          status: artwork.status,
          rejectedAt: artwork.rejectedAt,
          rejectionReason: artwork.rejectionReason,
        },
      };
    } catch (error) {
      logger.error("Error rejecting artwork:", error);
      throw error;
    }
  }

  // Get pending artworks for approval
  async getPendingArtworks(query = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sort = "-createdAt",
        search,
        minPrice,
        maxPrice,
      } = query;

      // Build filter
      const filter = {
        status: "pending",
        // listingFeeStatus: "paid",
      };

      // Price filtering
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = parseFloat(minPrice);
        if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
      }

      // Text search
      if (search) {
        filter.$text = {
          $search: search,
          $caseSensitive: false,
        };
      }

      const skip = (page - 1) * limit;

      // Parse sort
      const sortObj = this.parseSortString(sort);

      // Get artworks with basic populate
      const artworks = await Artwork.find(filter)
        .populate("artist", "username email profile createdAt")
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await Artwork.countDocuments(filter);

      return {
        artworks,
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
      logger.error("Error getting pending artwork:", error);
      throw error;
    }
  }

  // Get artwork statistics
  async getArtworkStats() {
    try {
      const mongoose = require("mongoose");

      const stats = await Artwork.aggregate([
        {
          $addFields: {
            // Create a boolean field to check if artwork is sold
            isSold: {
              $ne: ["$artist", "$currentOwner"],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalArtworks: { $sum: 1 },
            approvedArtworks: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
            },
            pendingArtworks: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            rejectedArtworks: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
            },
            // ✅ FIXED: Now use the boolean field we created
            soldArtworks: {
              $sum: {
                $cond: ["$isSold", 1, 0],
              },
            },
            transferredArtworks: {
              $sum: {
                $cond: [{ $gt: ["$totalSales", 0] }, 1, 0],
              },
            },
            averagePrice: { $avg: "$price" },
            totalValue: { $sum: "$price" },
          },
        },
      ]);

      // Get stats by time periods
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const recentStats = await Artwork.aggregate([
        {
          $facet: {
            lastMonth: [
              { $match: { createdAt: { $gte: thirtyDaysAgo } } },
              { $count: "count" },
            ],
            lastWeek: [
              { $match: { createdAt: { $gte: sevenDaysAgo } } },
              { $count: "count" },
            ],
            pendingLastWeek: [
              {
                $match: {
                  createdAt: { $gte: sevenDaysAgo },
                  status: "pending",
                },
              },
              { $count: "count" },
            ],
          },
        },
      ]);

      // ✅ COMPLETELY FIXED: Simplified marketplace stats without complex ObjectId comparisons
      const marketplaceStats = await Artwork.aggregate([
        {
          $facet: {
            // Most transferred artwork
            mostTransferred: [
              { $match: { totalSales: { $gt: 0 } } },
              { $sort: { totalSales: -1 } },
              { $limit: 1 },
              { $project: { title: 1, totalSales: 1, artist: 1 } },
            ],
            // Simplified average sale time calculation
            soldArtworks: [
              {
                $match: {
                  lastSaleDate: { $exists: true },
                  createdAt: { $exists: true },
                },
              },
              {
                $project: {
                  timeToSale: {
                    $divide: [
                      { $subtract: ["$lastSaleDate", "$createdAt"] },
                      1000 * 60 * 60 * 24, // Convert to days
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  averageDays: { $avg: "$timeToSale" },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]);

      const baseStats = stats[0] || {
        totalArtworks: 0,
        pendingArtworks: 0,
        approvedArtworks: 0,
        rejectedArtworks: 0,
        soldArtworks: 0,
        transferredArtworks: 0,
        averagePrice: 0,
        totalValue: 0,
      };

      return {
        ...baseStats,
        recentActivity: {
          artworksLastMonth: recentStats[0]?.lastMonth[0]?.count || 0,
          artworksLastWeek: recentStats[0]?.lastWeek[0]?.count || 0,
          pendingLastWeek: recentStats[0]?.pendingLastWeek[0]?.count || 0,
        },
        secondaryMarketActivity: {
          totalTransfers: baseStats.transferredArtworks,
          transferredArtworks: baseStats.transferredArtworks,
          transferRate:
            baseStats.totalArtworks > 0
              ? (
                  (baseStats.soldArtworks / baseStats.totalArtworks) *
                  100
                ).toFixed(2)
              : 0,
          averageTimeToFirstSale: marketplaceStats[0]?.soldArtworks?.[0]
            ?.averageDays
            ? Math.round(marketplaceStats[0].soldArtworks[0].averageDays)
            : null,
          mostTransferredArtwork:
            marketplaceStats[0]?.mostTransferred?.[0] || null,
        },
      };
    } catch (error) {
      logger.error("Error getting artwork stats:", error);
      throw error;
    }
  }

  // Get user statistics for admin dashboard
  async getUserStats() {
    try {
      const stats = await User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            totalArtists: {
              $sum: { $cond: [{ $eq: ["$role", "artist"] }, 1, 0] },
            },
            totalBuyers: {
              $sum: { $cond: [{ $eq: ["$role", "buyer"] }, 1, 0] },
            },
            verifiedUsers: {
              $sum: { $cond: [{ $eq: ["$isVerified", true] }, 1, 0] },
            },
            unverifiedUsers: {
              $sum: { $cond: [{ $eq: ["$isVerified", false] }, 1, 0] },
            },
          },
        },
      ]);

      // Get artwork ownership statistics
      const ownershipStats = await Artwork.aggregate([
        {
          $group: {
            _id: null,
            totalArtworks: { $sum: 1 },
            artworksOwnedByArtists: {
              $sum: {
                $cond: [
                  { $eq: ["$artist", "$currentOwner"] }, // Same person
                  1,
                  0,
                ],
              },
            },
            artworksOwnedByBuyers: {
              $sum: {
                $cond: [
                  { $ne: ["$artist", "$currentOwner"] }, // Different people
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      // Get recent user registrations
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const recentStats = await User.aggregate([
        {
          $facet: {
            lastMonth: [
              { $match: { createdAt: { $gte: thirtyDaysAgo } } },
              { $count: "count" },
            ],
            lastWeek: [
              { $match: { createdAt: { $gte: sevenDaysAgo } } },
              { $count: "count" },
            ],
            artistsLastWeek: [
              {
                $match: {
                  createdAt: { $gte: sevenDaysAgo },
                  role: "artist",
                },
              },
              { $count: "count" },
            ],
          },
        },
      ]);

      const baseStats = stats[0] || {
        totalUsers: 0,
        totalArtists: 0,
        totalBuyers: 0,
        verifiedUsers: 0,
        unverifiedUsers: 0,
      };

      const ownership = ownershipStats[0] || {
        totalArtworks: 0,
        artworksOwnedByArtists: 0,
        artworksOwnedByBuyers: 0,
      };

      return {
        ...baseStats,
        ...ownership,
        recentActivity: {
          usersLastMonth: recentStats[0]?.lastMonth[0]?.count || 0,
          usersLastWeek: recentStats[0]?.lastWeek[0]?.count || 0,
          artistsLastWeek: recentStats[0]?.artistsLastWeek[0]?.count || 0,
        },
      };
    } catch (error) {
      logger.error("Error getting user stats:", error);
      throw error;
    }
  }

  // Get platform overview for admin dashboard
  async getPlatformOverview() {
    try {
      const [artworkStats, userStats] = await Promise.all([
        this.getArtworkStats(),
        this.getUserStats(),
      ]);

      // Get revenue stats
      const revenueStats = await Transaction.aggregate([
        { $match: { status: "completed" } },
        {
          $group: {
            _id: "$transactionType",
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);

      const listingRevenue = revenueStats.find((r) => r._id === "listing_fee");
      const salesRevenue = revenueStats.find((r) => r._id === "sale");

      // Get recent activity (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const recentActivity = await Transaction.aggregate([
        {
          $match: {
            timestamp: { $gte: sevenDaysAgo },
            status: "completed",
          },
        },
        {
          $group: {
            _id: "$transactionType",
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);

      const recentListingFees = recentActivity.find(
        (r) => r._id === "listing_fee"
      );
      const recentSales = recentActivity.find((r) => r._id === "sale");

      return {
        overview: {
          totalUsers: userStats.totalUsers,
          totalArtists: userStats.totalArtists,
          totalBuyers: userStats.totalBuyers,
          totalArtworks: artworkStats.totalArtworks,
          pendingApprovals: artworkStats.pendingArtworks,
          totalRevenue:
            (listingRevenue?.totalAmount || 0) +
            (salesRevenue?.totalAmount || 0),
          totalSales: salesRevenue?.count || 0,
        },
        revenue: {
          listingFees: {
            total: listingRevenue?.totalAmount || 0,
            count: listingRevenue?.count || 0,
          },
          sales: {
            total: salesRevenue?.totalAmount || 0,
            count: salesRevenue?.count || 0,
          },
        },
        recentActivity: {
          usersLastWeek: userStats.recentActivity.usersLastWeek,
          artworksLastWeek: artworkStats.recentActivity.artworksLastWeek,
          pendingLastWeek: artworkStats.recentActivity.pendingLastWeek,
          listingFeesLastWeek: {
            amount: recentListingFees?.amount || 0,
            count: recentListingFees?.count || 0,
          },
          salesLastWeek: {
            amount: recentSales?.amount || 0,
            count: recentSales?.count || 0,
          },
        },
      };
    } catch (error) {
      logger.error("Error getting platform overview:", error);
      throw error;
    }
  }

  // Helper method to send artwork approval email
  async sendArtworkApprovalEmail(email, username, artworkTitle, artworkId) {
    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #28a745;">Artwork Approved! 🎉</h2>
          <p>Hello ${username},</p>
          <p>Great news! Your artwork "<strong>${artworkTitle}</strong>" has been approved and is now live on our marketplace.</p>
          <div style="background-color: #d4edda; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="margin: 0 0 10px 0; color: #155724;">What's Next?</h3>
            <p style="margin: 0; color: #155724;">• Your artwork is now visible to all buyers</p>
            <p style="margin: 0; color: #155724;">• You'll receive notifications when someone shows interest</p>
            <p style="margin: 0; color: #155724;">• Keep your profile updated to attract more buyers</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/artwork/${artworkId}" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Your Artwork</a>
          </div>
          <p>Thank you for being part of our artist community!</p>
          <p>Best regards,<br>3rd Hand Art Marketplace Team</p>
        </div>
      `;

      await emailService.sendEmail({
        email,
        subject: "Artwork Approved - 3rd Hand Art Marketplace",
        html,
      });
    } catch (error) {
      logger.error("Error sending approval email:", error);
    }
  }

  // Helper method to send artwork rejection email
  async sendArtworkRejectionEmail(email, username, artworkTitle, reason) {
    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc3545;">Artwork Review Update</h2>
          <p>Hello ${username},</p>
          <p>Thank you for submitting your artwork "<strong>${artworkTitle}</strong>" to our marketplace.</p>
          <div style="background-color: #f8d7da; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <h3 style="margin: 0 0 10px 0; color: #721c24;">Review Status: Not Approved</h3>
            <p style="margin: 0; color: #721c24;"><strong>Reason:</strong> ${reason}</p>
          </div>
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h3 style="margin: 0 0 10px 0; color: #856404;">What You Can Do:</h3>
            <p style="margin: 0; color: #856404;">• Review our artwork guidelines</p>
            <p style="margin: 0; color: #856404;">• Make necessary adjustments to your artwork</p>
            <p style="margin: 0; color: #856404;">• Submit a new artwork that meets our standards</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/dashboard/artworks" style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Guidelines</a>
          </div>
          <p>We appreciate your understanding and look forward to your future submissions.</p>
          <p>Best regards,<br>3rd Hand Art Marketplace Team</p>
        </div>
      `;

      await emailService.sendEmail({
        email,
        subject: "Artwork Review Update - 3rd Hand Art Marketplace",
        html,
      });
    } catch (error) {
      logger.error("Error sending rejection email:", error);
    }
  }

  // Helper method to parse sort string
  parseSortString(sortString) {
    const sortObj = {};
    if (sortString.startsWith("-")) {
      sortObj[sortString.substring(1)] = -1;
    } else {
      sortObj[sortString] = 1;
    }
    return sortObj;
  }
}

module.exports = new AdminService();
