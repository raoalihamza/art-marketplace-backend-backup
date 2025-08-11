const multer = require("multer");
const sharp = require("sharp");
const { cloudinary } = require("../config/cloudinary");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

// Configure multer for memory storage
const multerStorage = multer.memoryStorage();

// Filter for image files only
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new AppError("Not an image! Please upload only images.", 400), false);
  }
};

// Configure multer
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5, // Maximum 5 files
  },
});

// Upload multiple images
const uploadArtworkImages = upload.array("images", 5);

// Process and upload images to Cloudinary
const processArtworkImages = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new AppError("Please upload at least one image", 400));
  }

  try {
    req.body.images = [];

    // Process each image
    await Promise.all(
      req.files.map(async (file, index) => {
        // Generate unique filename
        const filename = `artwork-${req.user.id}-${Date.now()}-${index + 1}`;

        // Resize and optimize image
        const optimizedImageBuffer = await sharp(file.buffer)
          .resize(1200, 1200, {
            fit: sharp.fit.inside,
            withoutEnlargement: true,
          })
          .jpeg({ quality: 90 })
          .toBuffer();

        // Upload to Cloudinary
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              {
                folder: "artwork",
                public_id: filename,
                resource_type: "auto",
                transformation: [
                  { width: 1200, height: 1200, crop: "limit" },
                  { quality: "auto" },
                  { format: "auto" },
                ],
              },
              (error, result) => {
                if (error) {
                  logger.error("Cloudinary upload error:", error);
                  reject(new AppError("Image upload failed", 500));
                } else {
                  resolve(result);
                }
              }
            )
            .end(optimizedImageBuffer);
        });

        req.body.images.push(result.secure_url);
      })
    );

    next();
  } catch (error) {
    logger.error("Image processing error:", error);
    next(new AppError("Image processing failed", 500));
  }
};

const deleteCloudinaryImage = async (imageUrl) => {
  try {
    // Extract public_id from Cloudinary URL
    const publicId = imageUrl.split("/").pop().split(".")[0];
    const fullPublicId = `artwork/${publicId}`;

    await cloudinary.uploader.destroy(fullPublicId);
    logger.info(`Image deleted from Cloudinary: ${fullPublicId}`);
  } catch (error) {
    logger.error("Error deleting image from Cloudinary:", error);
  }
};

module.exports = {
  uploadArtworkImages,
  processArtworkImages,
  deleteCloudinaryImage,
};
