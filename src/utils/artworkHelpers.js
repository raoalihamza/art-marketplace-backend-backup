const sharp = require("sharp");
const AppError = require("./appError");

// Validate image dimensions
const validateImageDimensions = async (
  buffer,
  minWidth = 500,
  minHeight = 500
) => {
  try {
    const metadata = await sharp(buffer).metadata();

    if (metadata.width < minWidth || metadata.height < minHeight) {
      throw new AppError(
        `Image dimensions too small. Minimum size is ${minWidth}x${minHeight}px`,
        400
      );
    }

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Invalid image file", 400);
  }
};

module.exports = {
  validateImageDimensions,
};
