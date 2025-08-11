// Winston logger setup
const winston = require("winston");
const path = require("path");
const fs = require("fs");
const config = require("../config/config");

// Create logs directory
const logsDir = path.resolve("logs");
const errorDir = path.resolve("logs/error");
const combinedDir = path.resolve("logs/combined");

try {
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  if (!fs.existsSync(errorDir)) fs.mkdirSync(errorDir, { recursive: true });
  if (!fs.existsSync(combinedDir))
    fs.mkdirSync(combinedDir, { recursive: true });
} catch (error) {
  console.error("Could not create logs directory:", error.message);
}

const logFormat = winston.format.printf(
  ({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${message} ${stack ? `\n${stack}` : ""}`;
  }
);

const transports = [
  // Always include console
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
];

// Try to add file transports
try {
  transports.push(
    new winston.transports.File({
      filename: path.resolve("logs/error/error.log"),
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.resolve("logs/combined/combined.log"),
      maxsize: 5242880,
      maxFiles: 5,
    })
  );
  console.log("✅ File logging enabled");
} catch (error) {
  console.warn("⚠️ File logging disabled:", error.message);
}

const logger = winston.createLogger({
  level: config.nodeEnv === "development" ? "debug" : "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    logFormat
  ),
  transports,
  exitOnError: false,
});

logger.info("Logger initialized successfully");
module.exports = logger;

// Winston logger setup for serverless environment
// const winston = require("winston");
// const config = require("../config/config");

// // Define log format
// const logFormat = winston.format.printf(
//   ({ level, message, timestamp, stack }) => {
//     return `${timestamp} [${level}]: ${message} ${stack ? stack : ""}`;
//   }
// );

// // Create logger instance
// const logger = winston.createLogger({
//   level: config.nodeEnv === "development" ? "debug" : "info",
//   format: winston.format.combine(
//     winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
//     winston.format.errors({ stack: true }),
//     logFormat
//   ),
//   transports: [
//     // Only use console transport in serverless environment
//     new winston.transports.Console({
//       format: winston.format.combine(
//         winston.format.colorize(),
//         winston.format.simple()
//       ),
//     })
//   ],
// });

// // In development, you can add file transports if needed
// // But in production/serverless, only console logging works
// if (config.nodeEnv === "development" && typeof window === 'undefined') {
//   // Only add file transports in local development
//   try {
//     logger.add(new winston.transports.File({
//       filename: "logs/error.log",
//       level: "error",
//       maxsize: 5242880, // 5MB
//       maxFiles: 5,
//     }));

//     logger.add(new winston.transports.File({
//       filename: "logs/combined.log",
//       maxsize: 5242880, // 5MB
//       maxFiles: 5,
//     }));
//   } catch (error) {
//     // If file logging fails, just continue with console logging
//     console.warn('File logging not available, using console only');
//   }
// }

// module.exports = logger;
