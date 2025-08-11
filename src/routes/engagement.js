const express = require("express");
const engagementController = require("../controllers/engagementController");
const { protect, optionalAuth } = require("../middleware/auth");
const {
  validateArtworkId,
  validateUserId,
  validateEngagementQuery,
} = require("../validators/engagementValidator");

const router = express.Router();

// Public routes (no authentication required)
router.get(
  "/popular/artworks",
  validateEngagementQuery,
  engagementController.getPopularArtworks
);

router.get(
  "/trending/artists",
  validateEngagementQuery,
  engagementController.getTrendingArtists
);

// Protected routes (authentication required)
router.use(protect);

// View counter
router.post(
  "/artwork/:artworkId/view",
  validateArtworkId,
  engagementController.recordArtworkView
);

// Artwork engagement routes
router.post(
  "/artwork/:artworkId/like",
  validateArtworkId,
  engagementController.toggleArtworkLike
);

// Artist engagement routes
router.post(
  "/artist/:artistId/follow",
  validateUserId,
  engagementController.toggleArtistFollow
);

// User favorites and following routes
router.get(
  "/my/favorites",
  validateEngagementQuery,
  engagementController.getUserLikedArtworks
);

router.get(
  "/my/following",
  validateEngagementQuery,
  engagementController.getUserFollowedArtists
);

// User engagement statistics
router.get("/my/stats", engagementController.getUserEngagementStats);

module.exports = router;
