const cloudinary = require("cloudinary").v2;
const logger = require("../utils/logger");
const config = require("./config");

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

// Test connection
const testConnection = async () => {
  try {
    const result = await cloudinary.api.ping();
    logger.info("Cloudinary connection successful");
    return result;
  } catch (error) {
    logger.error("Cloudinary connection failed:", error);
    throw error;
  }
};

// Upload transformation presets
const transformations = {
  artwork: {
    thumbnail: "w_300,h_300,c_fill,f_auto,q_auto",
    medium: "w_800,h_800,c_limit,f_auto,q_auto",
    large: "w_1200,h_1200,c_limit,f_auto,q_auto",
  },
};

module.exports = {
  cloudinary,
  testConnection,
  transformations,
};
