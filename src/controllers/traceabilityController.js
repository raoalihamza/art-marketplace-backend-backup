const traceabilityService = require("../services/traceabilityService");
const logger = require("../utils/logger");

// Get artwork ownership history
const getArtworkHistory = async (req, res, next) => {
  try {
    const { artworkId } = req.params;

    const history = await traceabilityService.getArtworkHistory(artworkId);

    res.status(200).json({
      status: "success",
      data: {
        history,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getArtworkHistory controller: ${error.message}`);
  }
};

// Generate ownership certificate
const generateOwnershipCertificate = async (req, res, next) => {
  try {
    const { artworkId } = req.params;
    const userId = req.user.id;

    const certificate = await traceabilityService.generateOwnershipCertificate(
      artworkId,
      userId
    );

    res.status(200).json({
      status: "success",
      message: "Ownership certificate generated successfully",
      data: {
        certificate,
      },
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in generateOwnershipCertificate controller: ${error.message}`
    );
  }
};

// Verify artwork ownership
const verifyOwnership = async (req, res, next) => {
  try {
    const { artworkId } = req.params;
    const { userId } = req.query;

    // If no userId provided, use current user
    const claimedOwnerId = userId || req.user.id;

    const verification = await traceabilityService.verifyOwnership(
      artworkId,
      claimedOwnerId
    );

    res.status(200).json({
      status: "success",
      data: {
        verification,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in verifyOwnership controller: ${error.message}`);
  }
};

// Get traceability statistics (admin only)
const getTraceabilityStats = async (req, res, next) => {
  try {
    const stats = await traceabilityService.getTraceabilityStats();

    res.status(200).json({
      status: "success",
      data: {
        stats,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getTraceabilityStats controller: ${error.message}`);
  }
};

// Get user's ownership history
const getUserOwnershipHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await traceabilityService.getUserOwnershipHistory(
      userId,
      req.query
    );

    res.status(200).json({
      status: "success",
      results: result.records.length,
      data: {
        records: result.records,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in getUserOwnershipHistory controller: ${error.message}`
    );
  }
};

// Search traceability records (admin only)
const searchTraceabilityRecords = async (req, res, next) => {
  try {
    const result = await traceabilityService.searchTraceabilityRecords(
      req.query
    );

    res.status(200).json({
      status: "success",
      results: result.records.length,
      data: {
        records: result.records,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in searchTraceabilityRecords controller: ${error.message}`
    );
  }
};

module.exports = {
  getArtworkHistory,
  generateOwnershipCertificate,
  verifyOwnership,
  getTraceabilityStats,
  getUserOwnershipHistory,
  searchTraceabilityRecords,
};
