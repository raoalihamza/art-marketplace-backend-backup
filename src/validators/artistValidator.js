const { param, validationResult } = require("express-validator");
const User = require("../models/User");

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

// Artist ID validation
const validateArtistId = [
  param("id")
    .isMongoId()
    .withMessage("Valid user ID is required")
    .custom(async (value) => {
      const user = await User.findOne({
        _id: value,
        isVerified: true,
        // ✅ REMOVED: role restriction - allow both artists and buyers
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Check if user is eligible for public profile
      let canHavePublicProfile = false;

      if (user.role === "artist") {
        // Artists always have public profiles
        canHavePublicProfile = true;
      } else if (user.role === "buyer") {
        // Buyers/collectors can have public profiles IF they own artworks
        const ownedArtworkCount = await Artwork.countDocuments({
          currentOwner: value,
          status: "approved",
        });
        canHavePublicProfile = ownedArtworkCount > 0;
      }

      if (!canHavePublicProfile) {
        throw new Error("This user does not have a public profile");
      }

      return true;
    }),

  handleValidationErrors,
];

module.exports = {
  validateArtistId,
};
