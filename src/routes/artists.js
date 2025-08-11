const express = require("express");
const artistController = require("../controllers/artistController");
const { optionalAuth } = require("../middleware/auth");
const { validateArtistId } = require("../validators/artistValidator");

const router = express.Router();

// Get complete artist profile
router.get(
  "/:id",
  optionalAuth,
  validateArtistId,
  artistController.getCompleteArtistProfile
);

module.exports = router;
