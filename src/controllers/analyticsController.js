const analyticsService = require("../services/analyticsService");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

// Get top selling artists
const getTopSellingArtists = async (req, res, next) => {
  try {
    const result = await analyticsService.getTopSellingArtists(req.query);

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getTopSellingArtists controller: ${error.message}`);
  }
};

// Get top selling artworks
const getTopSellingArtworks = async (req, res, next) => {
  try {
    const result = await analyticsService.getTopSellingArtworks(req.query);

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getTopSellingArtworks controller: ${error.message}`);
  }
};

// Get top selling categories
const getTopSellingCategories = async (req, res, next) => {
  try {
    const result = await analyticsService.getTopSellingCategories(req.query);

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in getTopSellingCategories controller: ${error.message}`
    );
  }
};

// Generate comprehensive analytics report
const generateAnalyticsReport = async (req, res, next) => {
  try {
    const result = await analyticsService.generateAnalyticsReport(req.query);

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in generateAnalyticsReport controller: ${error.message}`
    );
  }
};

module.exports = {
  getTopSellingArtists,
  getTopSellingArtworks,
  getTopSellingCategories,
  generateAnalyticsReport,
};
