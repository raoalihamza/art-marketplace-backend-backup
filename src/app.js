const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const config = require("./config/config");
const { errorHandler } = require("./middleware/errorHandler");
const routes = require("./routes");

const app = express();

// Set security HTTP headers
app.use(helmet());

// Development logging
if (config.nodeEnv === "development") {
  app.use(morgan("dev"));
}

app.use(cors());

// Configure trust proxy based on environment
if (config.nodeEnv === "production") {
  // In production, trust only the first proxy (most cloud platforms)
  app.set("trust proxy", 1);
} else {
  // In development, disable rate limiting entirely
  app.set("trust proxy", false);
}

// configure rate limiting
if (config.nodeEnv === "production") {
  const limiter = rateLimit({
    windowMs: config.security.rateLimitWindow * 60 * 1000,
    max: config.security.rateLimitMax,
    message: "Too many requests from this IP, please try again later!",
  });
  app.use("/api", limiter);
} else {
  console.log("🚫 Rate limiting disabled in development");
}

// Stripe webhook needs raw body, not parsed JSON
app.use("/api/payments/webhook", express.raw({ type: "application/json" }), require("./routes/payments").webhookHandler);

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Compression
app.use(compression());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date(),
  });
});

// API routes
app.use("/api", routes);

// Handle unrecognized routes
app.all("*", (req, res, next) => {
  const err = new Error(`Can't find ${req.originalUrl} on this server!`);
  err.status = 404;
  next(err);
});

// Global error handler
app.use(errorHandler);

module.exports = app;
