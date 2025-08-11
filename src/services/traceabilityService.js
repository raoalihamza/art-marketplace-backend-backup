const mongoose = require("mongoose");
const TraceabilityRecord = require("../models/TraceabilityRecord");
const Artwork = require("../models/Artwork");
const User = require("../models/User");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

class TraceabilityService {
  // Get complete ownership history for an artwork
  async getArtworkHistory(artworkId) {
    try {
      const artwork = await Artwork.findById(artworkId)
        .populate("artist", "username email profile")
        .populate("currentOwner", "username email profile")
        .lean();

      if (!artwork) {
        throw new AppError("Artwork not found", 404);
      }

      // Get all traceability records for this artwork
      const traceabilityRecords = await TraceabilityRecord.find({
        artworkId,
      })
        .populate("fromUserId", "username email profile")
        .populate("toUserId", "username email profile")
        .sort({ timestamp: 1 }) // Chronological order
        .lean();

      // Build comprehensive history
      const history = {
        artwork: {
          id: artwork._id,
          title: artwork.title,
          images: artwork.images,
          price: artwork.price,
          status: artwork.status,
          createdAt: artwork.createdAt,
          totalSales: artwork.totalSales,
        },
        artist: artwork.artist,
        currentOwner: artwork.currentOwner,
        ownershipChain: traceabilityRecords.map((record) => ({
          id: record._id,
          transactionType: record.transactionType,
          fromUser: record.fromUserId,
          toUser: record.toUserId,
          timestamp: record.timestamp,
          transactionHash: record.transactionHash,
          details: {
            price: record.additionalData?.price,
            condition: record.additionalData?.condition,
            location: record.additionalData?.location,
            notes: record.additionalData?.notes,
            paymentIntent: record.additionalData?.paymentIntent,
            isResale: record.additionalData?.isResale,
            transferNumber: record.additionalData?.transferNumber,
          },
        })),
        statistics: {
          totalTransfers: traceabilityRecords.length,
          firstTransfer: traceabilityRecords[0]?.timestamp,
          lastTransfer:
            traceabilityRecords[traceabilityRecords.length - 1]?.timestamp,
          totalRevenue: traceabilityRecords.reduce(
            (sum, record) => sum + (record.additionalData?.price || 0),
            0
          ),
          uniqueOwners: [
            ...new Set(
              traceabilityRecords.map((r) => r.toUserId?._id?.toString())
            ),
          ].length,
        },
      };

      return history;
    } catch (error) {
      logger.error(`Error getting artwork history: ${error.message}`);
      throw error;
    }
  }

  // Generate ownership certificate
  async generateOwnershipCertificate(artworkId, userId) {
    try {
      const artwork = await Artwork.findById(artworkId)
        .populate("artist", "username email profile")
        .populate("currentOwner", "username email profile")
        .lean();

      if (!artwork) {
        throw new AppError("Artwork not found", 404);
      }

      // Verify current ownership
      if (artwork.currentOwner._id.toString() !== userId) {
        throw new AppError(
          "You can only generate certificates for artworks you own",
          403
        );
      }

      // Get latest ownership record
      const latestRecord = await TraceabilityRecord.findOne({
        artworkId,
        toUserId: userId,
      })
        .populate("fromUserId", "username email")
        .sort({ timestamp: -1 })
        .lean();

      // Get all previous records for verification
      const allRecords = await TraceabilityRecord.find({ artworkId })
        .sort({ timestamp: 1 })
        .lean();

      const certificate = {
        certificateId: `CERT-${artworkId}-${Date.now()}`,
        generatedAt: new Date(),
        artwork: {
          id: artwork._id,
          title: artwork.title,
          artist: artwork.artist,
          yearCreated: artwork.year,
          medium: artwork.medium,
          dimensions: artwork.dimensions,
          description: artwork.description,
          images: artwork.images,
        },
        currentOwner: artwork.currentOwner,
        ownership: {
          acquiredOn: latestRecord?.timestamp,
          acquiredFrom: latestRecord?.fromUserId,
          acquisitionType: latestRecord?.transactionType,
          transactionHash: latestRecord?.transactionHash,
          purchasePrice: latestRecord?.additionalData?.price,
        },
        provenance: {
          totalTransfers: allRecords.length,
          verificationHash: this.generateVerificationHash(
            artworkId,
            allRecords
          ),
          chainOfOwnership: allRecords.map((record) => ({
            timestamp: record.timestamp,
            type: record.transactionType,
            hash: record.transactionHash,
          })),
        },
        authenticity: {
          platformVerified: true,
          blockchainHash: this.generateBlockchainLikeHash(
            artworkId,
            allRecords
          ),
          verificationLevel: "PLATFORM_CERTIFIED",
        },
        legalDisclaimer:
          "This certificate confirms ownership on the 3rd Hand Art Marketplace platform. It does not constitute legal proof of ownership outside this platform.",
      };

      return certificate;
    } catch (error) {
      logger.error(`Error generating ownership certificate: ${error.message}`);
      throw error;
    }
  }

  // Verify ownership of an artwork
  async verifyOwnership(artworkId, claimedOwnerId) {
    try {
      const artwork = await Artwork.findById(artworkId)
        .populate("currentOwner", "username email")
        .lean();

      if (!artwork) {
        throw new AppError("Artwork not found", 404);
      }

      const isOwner = artwork.currentOwner._id.toString() === claimedOwnerId;

      // Get verification details
      const latestRecord = await TraceabilityRecord.findOne({
        artworkId,
        toUserId: claimedOwnerId,
      })
        .sort({ timestamp: -1 })
        .lean();

      const verification = {
        isVerified: isOwner,
        artworkId,
        claimedOwner: claimedOwnerId,
        actualOwner: artwork.currentOwner,
        verificationTimestamp: new Date(),
        ownershipDetails: isOwner
          ? {
              ownedSince: latestRecord?.timestamp,
              acquisitionType: latestRecord?.transactionType,
              transactionHash: latestRecord?.transactionHash,
            }
          : null,
      };

      return verification;
    } catch (error) {
      logger.error(`Error verifying ownership: ${error.message}`);
      throw error;
    }
  }

  // Get traceability statistics (for admin)
  async getTraceabilityStats() {
    try {
      const stats = await TraceabilityRecord.aggregate([
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            totalArtworksTracked: { $addToSet: "$artworkId" },
            totalTransfers: {
              $sum: { $cond: [{ $eq: ["$transactionType", "sold"] }, 1, 0] },
            },
            totalCreations: {
              $sum: {
                $cond: [{ $eq: ["$transactionType", "created"] }, 1, 0],
              },
            },
          },
        },
      ]);

      // Get most transferred artwork
      const mostTransferred = await TraceabilityRecord.aggregate([
        { $match: { transactionType: "sold" } },
        { $group: { _id: "$artworkId", transfers: { $sum: 1 } } },
        { $sort: { transfers: -1 } },
        { $limit: 1 },
        {
          $lookup: {
            from: "artworks",
            localField: "_id",
            foreignField: "_id",
            as: "artwork",
          },
        },
        { $unwind: "$artwork" },
      ]);

      // Recent activity
      const recentActivity = await TraceabilityRecord.find()
        .populate("artworkId", "title")
        .populate("fromUserId", "username")
        .populate("toUserId", "username")
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();

      const baseStats = stats[0] || {
        totalRecords: 0,
        totalArtworksTracked: [],
        totalTransfers: 0,
        totalCreations: 0,
      };

      return {
        overview: {
          totalRecords: baseStats.totalRecords,
          totalArtworksTracked: baseStats.totalArtworksTracked.length,
          totalTransfers: baseStats.totalTransfers,
          totalCreations: baseStats.totalCreations,
        },
        mostTransferredArtwork: mostTransferred[0] || null,
        recentActivity,
        generatedAt: new Date(),
      };
    } catch (error) {}
  }

  // Get user's ownership history
  async getUserOwnershipHistory(userId, query = {}) {
    try {
      const { page = 1, limit = 10, type = "all" } = query;
      const skip = (page - 1) * limit;

      // Build filter based on type
      let filter = {};
      if (type === "acquired") {
        filter.toUserId = userId;
      } else if (type === "sold") {
        filter.fromUserId = userId;
      } else {
        filter.$or = [{ fromUserId: userId }, { toUserId: userId }];
      }

      const records = await TraceabilityRecord.find(filter)
        .populate("artworkId", "title images price")
        .populate("fromUserId", "username profile")
        .populate("toUserId", "username profile")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await TraceabilityRecord.countDocuments(filter);

      return {
        records,
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
      logger.error(`Error getting user ownership history: ${error.message}`);
      throw error;
    }
  }

  // Helper method to generate verification hash
  generateVerificationHash(artworkId, records) {
    const crypto = require("crypto");
    const data = artworkId + records.map((r) => r.transactionHash).join("");
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  // Helper method to generate blockchain-like hash
  generateBlockchainLikeHash(artworkId, records) {
    const crypto = require("crypto");
    const chainData = records.map((r) => ({
      hash: r.transactionHash,
      timestamp: r.timestamp,
      type: r.transactionType,
    }));

    const blockData = JSON.stringify({
      artworkId,
      chain: chainData,
      timestamp: Date.now(),
    });

    return crypto.createHash("sha256").update(blockData).digest("hex");
  }

  // Public method to search traceability records
  async searchTraceabilityRecords(query = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        artworkId,
        userId,
        transactionType,
        startDate,
        endDate,
      } = query;

      const filter = {};

      if (artworkId) filter.artworkId = artworkId;
      if (userId) {
        filter.$or = [{ fromUserId: userId }, { toUserId: userId }];
      }
      if (transactionType) filter.transactionType = transactionType;
      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) filter.timestamp.$gte = new Date(startDate);
        if (endDate) filter.timestamp.$lte = new Date(endDate);
      }

      const skip = (page - 1) * limit;

      const records = await TraceabilityRecord.find(filter)
        .populate("artworkId", "title images")
        .populate("fromUserId", "username")
        .populate("toUserId", "username")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await TraceabilityRecord.countDocuments(filter);

      return {
        records,
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
      logger.error(`Error searching traceability records: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new TraceabilityService();
