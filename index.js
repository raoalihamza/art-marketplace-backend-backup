const app = require("./src/app");
const mongoose = require("mongoose");
const logger = require("./src/utils/logger");
const config = require("./src/config/config");
const { initializePaymentJobs } = require("./src/jobs/paymentJobs");

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  logger.error("Error name:", err.name);
  logger.error("Error message:", err.message);
  logger.error("Stack trace:", err.stack);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error("UNHANDLED REJECTION! 💥 Shutting down...");
  logger.error("Error name:", err.name);
  logger.error("Error message:", err.message);
  logger.error("Stack trace:", err.stack);
  server.close(() => {
    process.exit(1);
  });
});

const PORT = process.env.PORT || config.port || 5000;
let server;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodb.uri);
    console.log("Connected to MongoDB");

    // Initialize payment background jobs
    try {
      await initializePaymentJobs();
      logger.info("Payment jobs initialized");
    } catch (error) {
      logger.error("Payment jobs initialization failed:", error);
      // Continue server startup even if jobs fail
    }

    // Start server ONLY ONCE after MongoDB connection
    server = app.listen(PORT, () => {
      logger.info(`Server running in ${config.nodeEnv} mode on port ${PORT}`);
    });

    // Socket.io setup AFTER server is created
    const io = require("socket.io")(server, {
      cors: {
        origin: [
          config.frontendUrl,
          "http://localhost:3000",
          "http://127.0.0.1:5500",
          "file://",
          "*",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // Configure socket events
    try {
      require("./src/sockets")(io);
      logger.info("Socket.io initialized successfully");
    } catch (error) {
      logger.error("Socket configuration error:", error);
      // Don't crash if sockets fail to initialize
    }

    logger.info("🚀 Server startup completed successfully!");
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Handle SIGTERM signal
process.on("SIGTERM", () => {
  logger.info("👋 SIGTERM RECEIVED. Shutting down gracefully");
  if (server) {
    server.close(() => {
      logger.info("💥 Process terminated!");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});
