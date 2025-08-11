const express = require("express");
const artworkController = require("../controllers/artworkController");
const { protect, restrictTo, optionalAuth } = require("../middleware/auth");
const {
  uploadArtworkImages,
  processArtworkImages,
} = require("../middleware/upload");
const {
  checkArtworkOwnership,
  checkArtworkModifiable,
} = require("../middleware/artworkOwnership");
const {
  validateCreateArtwork,
  validateUpdateArtwork,
  validateArtworkQuery,
  validateArtworkId,
} = require("../validators/artworkValidator");

const router = express.Router();

// Public routes
router.get("/", validateArtworkQuery, artworkController.getArtworks);
router.get("/search", validateArtworkQuery, artworkController.searchArtworks);
router.get(
  "/:id",
  optionalAuth,
  validateArtworkId,
  artworkController.getArtworkById
);

// Public route with optional authentication
router.get(
  "/artist/:id",
  optionalAuth,
  validateArtworkId,
  artworkController.getArtworksByArtist
);

// Protected routes (authentication required)
router.use(protect);

// Artist-only route
router.post(
  "/",
  restrictTo("artist"),
  uploadArtworkImages,
  processArtworkImages,
  validateCreateArtwork,
  artworkController.createArtwork
);

router.get(
  "/my/artworks",
  validateArtworkQuery,
  artworkController.getMyArtworks
);

// TEMPORARILY DISABLED: Listing fee requirement
// route for unpaid artworks
// router.get(
//   "/my/unpaid",
//   restrictTo("artist"),
//   artworkController.getUnpaidArtworks
// );

// Artwork management routes (only artwork owner can access)
router.patch(
  "/:id",
  validateArtworkId,
  checkArtworkOwnership,
  checkArtworkModifiable,
  validateUpdateArtwork,
  artworkController.updateArtwork
);

router.delete(
  "/:id",
  validateArtworkId,
  checkArtworkOwnership,
  checkArtworkModifiable,
  artworkController.deleteArtwork
);

// User interaction routes -- (later)
router.post(
  "/:id/like",
  protect,
  validateArtworkId,
  artworkController.toggleArtworkLike
);

// Statistics route
router.get("/stats/overview", artworkController.getArtworkStats);

module.exports = router;
