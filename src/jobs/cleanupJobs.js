// Database cleanup jobs (cleanup_jobs_breakdown)
const Queue = require("bull");
const config = require("../config/config");
const User = require("../models/User");
const Artwork = require("../models/Artwork");
const Message = require("../models/Message");
const Transaction = require("../models/Transaction");
const TraceabilityRecord = require("../models/TraceabilityRecord");
const ListingPayment = require("../models/ListingPayment");
const { deleteCloudinaryImage } = require("../middleware/upload");
const artworkCacheService = require("../services/artworkCacheService");
const logger = require("../utils/logger");

// Create cleanup queue
const cleanupQueue = new Queue("cleanup tasks", {
  redis: {
    port: config.redis.port || 6379,
    host: config.redis.host || "localhost",
  },
});

// Process artwork cleanup (when artwork is deleted)
cleanupQueue.process("cleanup-artwork", async (job) => {
  const { artworkId, images, userId } = job.data;

  try {
    logger.info(`Processing artwork cleanup: ${artworkId}`);

    job.progress(10);

    // Delete images from Cloudinary
    if (images && images.length > 0) {
      await Promise.all(
        images.map(async (imageUrl) => {
          try {
            await deleteCloudinaryImage(imageUrl);
          } catch (error) {
            logger.error(`Failed to delete image ${imageUrl}:`, error);
          }
        })
      );
    }

    job.progress(40);

    // Delete related traceability records
    await TraceabilityRecord.deleteMany({ artworkId });

    job.progress(60);

    // Delete related listing payments
    await ListingPayment.deleteMany({ artwork: artworkId });

    job.progress(80);

    // Invalidate related caches
    await artworkCacheService.invalidateArtworkCache(artworkId);

    job.progress(100);

    logger.info(`Artwork cleanup completed: ${artworkId}`);

    return { success: true, artworkId, deletedImages: images?.length || 0 };
  } catch (error) {
    logger.error(`Artwork cleanup failed for ${artworkId}:`, error);
    throw error;
  }
});

// Process user cleanup (when user account is deleted)
cleanupQueue.process("cleanup-user", async (job) => {
  const { userId, userRole } = job.data;

  try {
    logger.info(`Processing user cleanup: ${userId}`);

    job.progress(10);

    if (userRole === "artist") {
      // Get all artworks by this artist
      const artworks = await Artwork.find({ artist: userId });

      job.progress(30);

      // Delete all artist's artworks and their related data
      for (const artwork of artworks) {
        // Add artwork cleanup job for each artwork
        await addArtworkCleanupJob(artwork._id, artwork.images, userId);
      }

      // Delete artist profile
      const ArtistProfile = require("../models/ArtistProfile");
      await ArtistProfile.deleteOne({ userId });
    }

    job.progress(60);

    // Delete user's messages
    await Message.deleteMany({
      $or: [{ sender: userId }, { receiver: userId }],
    });

    job.progress(80);

    // Delete user's transactions (keep for record-keeping, just anonymize)
    await Transaction.updateMany(
      { $or: [{ buyer: userId }, { seller: userId }] },
      { $set: { anonymized: true } }
    );

    job.progress(100);

    logger.info(`User cleanup completed: ${userId}`);

    return { success: true, userId };
  } catch (error) {
    logger.error(`User cleanup failed for ${userId}:`, error);
    throw error;
  }
});

// Process expired sessions cleanup
cleanupQueue.process("cleanup-expired-sessions", async (job) => {
  try {
    logger.info("Processing expired sessions cleanup");

    job.progress(20);

    // Clean up expired password reset tokens
    const expiredResetUsers = await User.updateMany(
      { passwordResetExpires: { $lt: Date.now() } },
      {
        $unset: {
          passwordResetToken: 1,
          passwordResetExpires: 1,
        },
      }
    );

    job.progress(50);

    // Clean up expired OTP verifications
    const expiredOTPUsers = await User.updateMany(
      { verificationOTPExpires: { $lt: Date.now() } },
      {
        $unset: {
          verificationOTP: 1,
          verificationOTPExpires: 1,
        },
      }
    );

    job.progress(80);

    // Clean up old unverified users (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deletedUnverifiedUsers = await User.deleteMany({
      isVerified: false,
      createdAt: { $lt: sevenDaysAgo },
    });

    job.progress(100);

    logger.info(
      `Expired sessions cleanup completed. Reset tokens: ${expiredResetUsers.modifiedCount}, OTP: ${expiredOTPUsers.modifiedCount}, Unverified users: ${deletedUnverifiedUsers.deletedCount}`
    );

    return {
      success: true,
      expiredResetTokens: expiredResetUsers.modifiedCount,
      expiredOTPs: expiredOTPUsers.modifiedCount,
      deletedUnverifiedUsers: deletedUnverifiedUsers.deletedCount,
    };
  } catch (error) {
    logger.error("Expired sessions cleanup failed:", error);
    throw error;
  }
});

// Process old messages cleanup
cleanupQueue.process("cleanup-old-messages", async (job) => {
  const { daysOld = 365 } = job.data; // Default: messages older than 1 year

  try {
    logger.info(`Processing old messages cleanup: older than ${daysOld} days`);

    job.progress(20);

    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const deletedMessages = await Message.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    job.progress(100);

    logger.info(
      `Old messages cleanup completed. Deleted: ${deletedMessages.deletedCount} messages`
    );

    return {
      success: true,
      deletedMessages: deletedMessages.deletedCount,
      cutoffDate,
    };
  } catch (error) {
    logger.error("Old messages cleanup failed:", error);
    throw error;
  }
});

// Process cache cleanup
cleanupQueue.process("cleanup-cache", async (job) => {
  try {
    logger.info("Processing cache cleanup");

    job.progress(30);

    // Clear expired cache entries
    await artworkCacheService.clearExpiredEntries();

    job.progress(70);

    // Clear specific cache patterns if needed
    const { patterns } = job.data;
    if (patterns && Array.isArray(patterns)) {
      for (const pattern of patterns) {
        await artworkCacheService.clearByPattern(pattern);
      }
    }

    job.progress(100);

    logger.info("Cache cleanup completed");

    return { success: true };
  } catch (error) {
    logger.error("Cache cleanup failed:", error);
    throw error;
  }
});

// Add job functions
const addArtworkCleanupJob = (artworkId, images, userId) => {
  return cleanupQueue.add(
    "cleanup-artwork",
    { artworkId, images, userId },
    {
      attempts: 2,
      delay: 5000,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    }
  );
};

const addUserCleanupJob = (userId, userRole) => {
  return cleanupQueue.add(
    "cleanup-user",
    { userId, userRole },
    {
      attempts: 1,
      delay: 10000,
    }
  );
};

const addExpiredSessionsCleanupJob = () => {
  return cleanupQueue.add(
    "cleanup-expired-sessions",
    {},
    {
      repeat: { cron: "0 2 * * *" }, // Daily at 2 AM
      attempts: 2,
    }
  );
};

const addOldMessagesCleanupJob = (daysOld = 365) => {
  return cleanupQueue.add(
    "cleanup-old-messages",
    { daysOld },
    {
      repeat: { cron: "0 3 0 * *" }, // Monthly at 3 AM on 1st day
      attempts: 1,
    }
  );
};

const addCacheCleanupJob = (patterns = []) => {
  return cleanupQueue.add(
    "cleanup-cache",
    { patterns },
    {
      repeat: { cron: "0 4 * * *" }, // Daily at 4 AM
      attempts: 1,
    }
  );
};

// Error handling
cleanupQueue.on("failed", (job, err) => {
  logger.error(`Cleanup job ${job.id} failed:`, err);
});

cleanupQueue.on("completed", (job, result) => {
  logger.info(`Cleanup job ${job.id} completed:`, result);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await cleanupQueue.close();
});

module.exports = {
  cleanupQueue,
  addArtworkCleanupJob,
  addUserCleanupJob,
  addExpiredSessionsCleanupJob,
  addOldMessagesCleanupJob,
  addCacheCleanupJob,
};
