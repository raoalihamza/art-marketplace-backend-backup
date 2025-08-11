const express = require("express");
const router = express.Router();

// Import all route modules
const authRoutes = require("./auth");
const artworkRoutes = require("./artwork");
const artistRoutes = require("./artists");
// const userRoutes = require("./users");
const paymentRoutes = require("./payments");
const adminRoutes = require("./admin");
const analyticsRoutes = require("./analytics");
const messageRoutes = require("./messages");
const traceabilityRoutes = require("./traceability");
// const uploadRoutes = require("./upload");
const engagementRoutes = require("./engagement");

// Mount routes
router.use("/auth", authRoutes);
router.use("/artwork", artworkRoutes);
router.use("/artists", artistRoutes);
// router.use("/users", userRoutes);
router.use("/payments", paymentRoutes);
router.use("/admin", adminRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/messages", messageRoutes);
router.use("/traceability", traceabilityRoutes);
// router.use("/upload", uploadRoutes);
router.use("/engagement", engagementRoutes);

module.exports = router;
