const express = require("express");
const analyticsController = require("../controllers/analyticsController");
const { protect, restrictTo } = require("../middleware/auth");
const {
  validateAnalyticsQuery,
  validateReportQuery,
} = require("../validators/analyticsValidator");

const router = express.Router();

// All analytics routes require authentication and admin role
router.use(protect);
router.use(restrictTo("admin"));

// Top selling artists
router.get(
  "/top-artists",
  validateAnalyticsQuery,
  analyticsController.getTopSellingArtists
);

// Top selling artworks
router.get(
  "/top-artworks",
  validateAnalyticsQuery,
  analyticsController.getTopSellingArtworks
);

// Top selling categories
router.get(
  "/top-categories",
  validateAnalyticsQuery,
  analyticsController.getTopSellingCategories
);

// Comprehensive analytics report
router.get(
  "/report",
  validateReportQuery,
  analyticsController.generateAnalyticsReport
);

router.get("/ownership", validateAnalyticsQuery, async (req, res, next) => {
  try {
    const result = await analyticsService.getOwnershipAnalytics(req.query);
    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
