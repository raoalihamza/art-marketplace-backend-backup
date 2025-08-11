// This middleware checks if the user owns the artwork and if it can be modified

const Artwork = require("../models/Artwork");
const AppError = require("../utils/appError");
const Transaction = require("../models/Transaction");

// check if user owns the artwork
const checkArtworkOwnership = async (req, res, next) => {
  try {
    const artwork = await Artwork.findById(req.params.id);

    if (!artwork) {
      return next(new AppError("Artwork not found", 404));
    }

    if (artwork.currentOwner.toString() !== req.user.id) {
      return next(
        new AppError("You do not have permission to modify this artwork", 403)
      );
    }

    // Attach artwork to request for use in controller
    req.artwork = artwork;
    next();
  } catch (error) {
    next(error);
    console.log(`Error in checkArtworkOwnership middleware: ${error.message}`);
  }
};

// Check if artwork can be modified (not sold)
const checkArtworkModifiable = (req, res, next) => {
  Transaction.findOne({
    artwork: req.artwork._id,
    status: "pending",
  })
    .then((pendingTransaction) => {
      if (pendingTransaction) {
        return next(
          new AppError("Cannot modify artwork with pending transaction", 400)
        );
      }
      next();
    })
    .catch(next);
};

module.exports = {
  checkArtworkOwnership,
  checkArtworkModifiable,
};
