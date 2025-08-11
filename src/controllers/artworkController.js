const Artwork = require("../models/Artwork");
const artworkService = require("../services/artworkService");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

// Create new artwork
const createArtwork = async (req, res, next) => {
  try {
    // Check if user is an artist
    if (req.user.role !== "artist") {
      return next(new AppError("Only artists can create artwork", 403));
    }

    const artwork = await artworkService.createArtwork(req.user.id, req.body);

    res.status(201).json({
      status: "success",
      message: "Artwork created successfully. It will be reviewed by our team.",
      data: {
        artwork,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get all artworks
const getArtworks = async (req, res, next) => {
  try {
    const result = await artworkService.getArtworks(req.query);

    res.status(200).json({
      status: "success",
      results: result.artworks.length,
      data: {
        artworks: result.artworks,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single artwork
const getArtworkById = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;

    const artwork = await artworkService.getArtworkById(
      req.params.id,
      false,
      userId
    );

    // Record view if user is viewing
    if (userId) {
      const engagementService = require("../services/engagementService");

      // Don't await this to avoid slowing down the response
      engagementService
        .recordArtworkView(req.params.id, userId)
        .catch(() => {});
    }

    res.status(200).json({
      status: "success",
      data: {
        artwork,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update artwork
const updateArtwork = async (req, res, next) => {
  try {
    const artwork = await artworkService.updateArtwork(
      req.params.id,
      req.body,
      req.user.id
    );

    res.status(200).json({
      status: "success",
      message: "Artwork updated successfully",
      data: {
        artwork,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Delete artwork
const deleteArtwork = async (req, res, next) => {
  try {
    const result = await artworkService.deleteArtwork(
      req.params.id,
      req.user.id
    );

    res.status(200).json({
      status: "success",
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

// Get artworks by artist
const getArtworksByArtist = async (req, res, next) => {
  try {
    const { id: artistId } = req.params;
    const { view = "created" } = req.query;

    // Handle different view types
    let includePrivate = false;
    let viewType = "created";

    if (req.user && req.user.id === artistId) {
      includePrivate = true;
      viewType = view; // Allow artist to see all views
    } else {
      viewType = "created"; // Public can only see created artworks
    }

    const result = await artworkService.getArtworksByArtist(artistId, {
      ...req.query,
      viewType,
      includePrivate,
    });

    res.status(200).json({
      status: "success",
      results: result.artworks.length,
      data: {
        artworks: result.artworks,
        pagination: result.pagination,
        viewType,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get current user's artworks (for dashboard)
const getMyArtworks = async (req, res, next) => {
  try {
    const { view = "owned" } = req.query;

    let result;

    if (req.user.role === "artist") {
      // Artists can see created, owned, and sold artworks
      result = await artworkService.getArtworksByArtist(req.user.id, {
        ...req.query,
        viewType: view, // "created", "owned", "sold"
        includePrivate: true,
        // TEMPORARILY DISABLED: Listing fee requirement
        // includeUnpaid: false,
        includeUnpaid: true, // Show all artworks regardless of payment status,
      });
    } else {
      // Buyers can only see owned artworks
      result = await artworkService.getArtworksByArtist(req.user.id, {
        ...req.query,
        viewType: "owned",
        includePrivate: true,
      });
    }

    res.status(200).json({
      status: "success",
      results: result.artworks.length,
      data: {
        artworks: result.artworks,
        pagination: result.pagination,
        viewType: view,
      },
    });
  } catch (error) {
    next(error);
  }
};

/*
// TEMPORARILY DISABLED: Listing fee requirement
// method to get unpaid artworks for artist
const getUnpaidArtworks = async (req, res, next) => {
  try {
    if (req.user.role !== "artist") {
      return next(new AppError("Only artists can access unpaid artworks", 403));
    }

    const artworks = await Artwork.find({
      artist: req.user.id,
      listingFeeStatus: { $in: ["unpaid", "failed"] },
    }).populate("artist", "username profile");

    res.status(200).json({
      status: "success",
      results: artworks.length,
      data: {
        artworks,
      },
    });
  } catch (error) {
    next(error);
  }
};
*/

// Search artworks
const searchArtworks = async (req, res, next) => {
  try {
    const { q: searchTerm } = req.query;

    if (!searchTerm) {
      return next(new AppError("Search term is required", 400));
    }

    const result = await artworkService.searchArtworks(searchTerm, req.query);

    res.status(200).json({
      status: "success",
      results: result.artworks.length,
      data: {
        artworks: result.artworks,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get artwork statistics
const getArtworkStats = async (req, res, next) => {
  try {
    let artistId = null;

    // If user is an artist, get their stats
    if (req.user.role === "artist") {
      artistId = req.user.id;
    }

    const stats = await artworkService.getArtworkStats(artistId);

    res.status(200).json({
      status: "success",
      data: {
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Like/Unlike artwork
const toggleArtworkLike = async (req, res, next) => {
  try {
    const engagementService = require("../services/engagementService");
    const { id: artworkId } = req.params;
    const userId = req.user.id;

    const result = await engagementService.toggleArtworkLike(userId, artworkId);

    res.status(200).json({
      status: "success",
      message: `Artwork ${result.action} successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createArtwork,
  getArtworks,
  getArtworkById,
  updateArtwork,
  deleteArtwork,
  getArtworksByArtist,
  getMyArtworks,
  // TEMPORARILY DISABLED: Listing fee requirement
  // getUnpaidArtworks,
  searchArtworks,
  getArtworkStats,
  toggleArtworkLike,
};
