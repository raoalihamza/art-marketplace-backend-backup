const engagementService = require("../services/engagementService");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

// Toggle artwork like/unlike
const toggleArtworkLike = async (req, res, next) => {
  try {
    const { artworkId } = req.params;
    const userId = req.user.id;

    const result = await engagementService.toggleArtworkLike(userId, artworkId);

    res.status(200).json({
      status: "success",
      message: `Artwork ${result.action} successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
    logger.error(`Error in toggleArtworkLike controller: ${error.message}`);
  }
};

// Toggle artist follow/unfollow
const toggleArtistFollow = async (req, res, next) => {
  try {
    const { artistId } = req.params;
    const userId = req.user.id;

    const result = await engagementService.toggleArtistFollow(userId, artistId);

    res.status(200).json({
      status: "success",
      message: `Artist ${result.action} successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
    logger.error(`Error in toggleArtistFollow controller: ${error.message}`);
  }
};

// Get user's liked artworks (favorites)
const getUserLikedArtworks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await engagementService.getUserLikedArtworks(
      userId,
      req.query
    );

    res.status(200).json({
      status: "success",
      results: result.likedArtworks.length,
      data: {
        favorites: result.likedArtworks,
        stats: result.stats,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getUserLikedArtworks controller: ${error.message}`);
  }
};

// Get user's followed artists
const getUserFollowedArtists = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await engagementService.getUserFollowedArtists(
      userId,
      req.query
    );

    res.status(200).json({
      status: "success",
      results: result.followedArtists.length,
      data: {
        followedArtists: result.followedArtists,
        stats: result.stats,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in getUserFollowedArtists controller: ${error.message}`
    );
  }
};

// Get popular artworks
const getPopularArtworks = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const result = await engagementService.getPopularArtworks(parseInt(limit));

    res.status(200).json({
      status: "success",
      results: result.total,
      data: {
        artworks: result.artworks,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getPopularArtworks controller: ${error.message}`);
  }
};

// Get trending artists
const getTrendingArtists = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    const result = await engagementService.getTrendingArtists(parseInt(limit));

    res.status(200).json({
      status: "success",
      results: result.total,
      data: {
        artists: result.artists,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getTrendingArtists controller: ${error.message}`);
  }
};

// Get user engagement statistics
const getUserEngagementStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await engagementService.getUserEngagementStats(userId);

    res.status(200).json({
      status: "success",
      data: {
        stats: result,
      },
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in getUserEngagementStats controller: ${error.message}`
    );
  }
};

// Record artwork view (for view counting)
const recordArtworkView = async (req, res, next) => {
  try {
    const { artworkId } = req.params;
    const userId = req.user ? req.user.id : null;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required to record views",
      });
    }

    await engagementService.recordArtworkView(artworkId, userId);

    res.status(200).json({
      status: "success",
      message: "Artwork view recorded",
    });
  } catch (error) {
    next(error);
    logger.error(`Error in recordArtworkView controller: ${error.message}`);
  }
};

module.exports = {
  toggleArtworkLike,
  toggleArtistFollow,
  getUserLikedArtworks,
  getUserFollowedArtists,
  getPopularArtworks,
  getTrendingArtists,
  getUserEngagementStats,
  recordArtworkView,
};
