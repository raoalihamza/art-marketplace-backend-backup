const mongoose = require("mongoose");
const User = require("../models/User");
const Artwork = require("../models/Artwork");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

class EngagementService {
  // toggle artwork like/unlike
  async toggleArtworkLike(userId, artworkId) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // Get user and artwork within the transaction
      const user = await User.findById(userId).session(session);
      const artwork = await Artwork.findById(artworkId).session(session);

      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (!artwork) {
        throw new AppError("Artwork not found", 404);
      }

      if (artwork.status !== "approved") {
        throw new AppError("Cannot like unapproved artwork", 400);
      }

      // Check if user is trying to like their own artwork
      if (
        artwork.artist.toString() === userId ||
        artwork.currentOwner.toString() === userId
      ) {
        throw new AppError("You cannot like your own artwork", 400);
      }

      // Toggle like in user model
      const userResult = user.toggleArtworkLike(artworkId);

      // Update artwork engagement stats directly within the transaction
      if (userResult.action === "liked") {
        // Add user to artwork's likedBy array if not already present
        if (!artwork.likedBy.includes(userId)) {
          artwork.likedBy.push(userId);
        }

        // Update engagement stats directly
        artwork.engagementStats.totalLikes += 1;
        artwork.engagementStats.lastLikedAt = new Date();
      } else {
        // Remove user from artwork's likedBy array
        artwork.likedBy = artwork.likedBy.filter(
          (id) => id.toString() !== userId
        );

        // Update engagement stats directly
        artwork.engagementStats.totalLikes = Math.max(
          0,
          artwork.engagementStats.totalLikes - 1
        );
      }

      // Update popularity score (likes * 2 + views)
      artwork.engagementStats.popularityScore =
        artwork.engagementStats.totalLikes * 2 +
        artwork.engagementStats.totalViews;

      // Save both documents within the transaction
      await user.save({ session });
      await artwork.save({ session });

      // Commit the transaction
      await session.commitTransaction();

      // Populate artwork artist info for response (outside transaction)
      const populatedArtwork = await Artwork.findById(artworkId)
        .populate("artist", "username profile")
        .select("title engagementStats");

      logger.info(`User ${userId} ${userResult.action} artwork ${artworkId}`);

      return {
        action: userResult.action,
        artwork: {
          id: populatedArtwork._id,
          title: populatedArtwork.title,
          artist: populatedArtwork.artist,
          totalLikes: populatedArtwork.engagementStats.totalLikes,
        },
        user: {
          totalLikes: userResult.totalLikes,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error toggling artwork like: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Toggle artist follow/unfollow
  async toggleArtistFollow(userId, artistId) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // Get user and artist
      const user = await User.findById(userId).session(session);
      const artist = await User.findById(artistId).session(session);

      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (!artist) {
        throw new AppError("Artist not found", 404);
      }

      if (artist.role !== "artist") {
        throw new AppError("You can only follow artists", 400);
      }

      if (userId === artistId) {
        throw new AppError("You cannot follow yourself", 400);
      }

      // Toggle follow in user model
      const userResult = user.toggleArtistFollow(artistId);

      // Update artist's follower count
      if (userResult.action === "followed") {
        if (!artist.followers.includes(userId)) {
          artist.followers.push(userId);
          artist.engagementStats.totalFollowers += 1;
        }
      } else {
        artist.followers = artist.followers.filter(
          (id) => id.toString() !== userId
        );

        artist.engagementStats.totalFollowers = Math.max(
          0,
          artist.engagementStats.totalFollowers - 1
        );
      }

      // Save changes
      await user.save({ session });
      await artist.save({ session });

      await session.commitTransaction();

      logger.info(`User ${userId} ${userResult.action} artist ${artistId}`);

      return {
        action: userResult.action,
        artist: {
          id: artist._id,
          username: artist.username,
          profile: artist.profile,
          totalFollowers: artist.engagementStats.totalFollowers,
        },
        user: {
          totalFollowing: userResult.totalFollowing,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Error toggling artist follow: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get user's liked artworks
  async getUserLikedArtworks(userId, query = {}) {
    try {
      const { page = 1, limit = 10 } = query;

      const user = await User.getUserLikedArtworks(userId, { page, limit });

      if (!user) {
        throw new AppError("User not found", 404);
      }

      // Get total count for pagination
      const totalLiked = user.likedArtworks ? user.likedArtworks.length : 0;

      return {
        likedArtworks: user.likedArtworks || [],
        stats: user.engagementStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalLiked,
          totalPages: Math.ceil(totalLiked / limit),
          hasNextPage: page * limit < totalLiked,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      logger.error(`Error getting user liked artworks: ${error.message}`);
      throw error;
    }
  }

  // Get user's followed artists
  async getUserFollowedArtists(userId, query = {}) {
    try {
      const { page = 1, limit = 10 } = query;

      const user = await User.getUserFollowedArtists(userId, { page, limit });

      if (!user) {
        throw new AppError("User not found", 404);
      }

      // Get total count for pagination
      const totalFollowing = user.followedArtists
        ? user.followedArtists.length
        : 0;

      return {
        followedArtists: user.followedArtists || [],
        stats: user.engagementStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalFollowing,
          totalPages: Math.ceil(totalFollowing / limit),
          hasNextPage: page * limit < totalFollowing,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      logger.error(`Error getting user followed artists: ${error.message}`);
      throw error;
    }
  }

  // Get popular artworks
  async getPopularArtworks(limit = 10) {
    try {
      const artworks = await Artwork.getPopularArtworks(limit);

      return {
        artworks,
        total: artworks.length,
      };
    } catch (error) {
      logger.error(`Error getting popular artworks: ${error.message}`);
      throw error;
    }
  }

  // Get trending artists (by followers and recent activity)
  async getTrendingArtists(limit = 10) {
    try {
      const artists = await User.find({
        role: "artist",
        isVerified: true,
      })
        .sort({
          "engagementStats.totalFollowers": -1,
          "engagementStats.lastActivityAt": -1,
        })
        .limit(limit)
        .select("username profile engagementStats createdAt")
        .lean();

      return {
        artists,
        total: artists.length,
      };
    } catch (error) {
      logger.error(`Error getting trending artists: ${error.message}`);
      throw error;
    }
  }

  // Get user engagement statistics
  async getUserEngagementStats(userId) {
    try {
      const user = await User.findById(userId).select("engagementStats role");

      if (!user) {
        throw new AppError("User not found", 404);
      }

      let additionalStats = {};

      if (user.role === "artist") {
        // Get artwork stats for artists
        const artworkStats = await Artwork.aggregate([
          { $match: { artist: new mongoose.Types.ObjectId(userId) } },
          {
            $group: {
              _id: null,
              totalArtworks: { $sum: 1 },
              totalLikes: { $sum: "$engagementStats.totalLikes" },
              totalViews: { $sum: "$engagementStats.totalViews" },
              averageLikes: { $avg: "$engagementStats.totalLikes" },
            },
          },
        ]);

        additionalStats = artworkStats[0] || {
          totalArtworks: 0,
          totalLikes: 0,
          totalViews: 0,
          averageLikes: 0,
        };
      }

      return {
        engagementStats: user.engagementStats,
        ...additionalStats,
      };
    } catch (error) {
      logger.error(`Error getting user engagement stats: ${error.message}`);
      throw error;
    }
  }

  // Record artwork view (for analytics)
  async recordArtworkView(artworkId, userId) {
    try {
      // Only count views for authenticated users. Skip anonymous views.
      if (!userId) {
        return;
      }

      // Check if user already viewed this artwork recently (last 24 hours)
      const recentView = await Artwork.findOne({
        _id: artworkId,
        "viewHistory.userId": userId,
        "viewHistory.viewedAt": {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });

      // Don't count duplicate views within 24 hours
      if (recentView) {
        return;
      }

      // Increment view count
      await Artwork.incrementViewCount(artworkId);

      // Store view history for analytics
      await Artwork.findByIdAndUpdate(artworkId, {
        $push: {
          viewHistory: {
            userId,
            viewedAt: new Date(),
          },
        },
      });

      logger.debug(`View recorded for artwork ${artworkId} by user ${userId}`);
    } catch (error) {
      logger.error(`Error recording artwork view: ${error.message}`);
      // Don't throw error for view tracking failures
    }
  }
}

module.exports = new EngagementService();
