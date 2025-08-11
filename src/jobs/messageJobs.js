const Queue = require("bull");
const Message = require("../models/Message");
const User = require("../models/User");
const logger = require("../utils/logger");

// Create message processing queue
const messageQueue = new Queue("message processing", {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || "localhost",
  },
});

// Process message cleanup (delete old messages)
messageQueue.process("cleanup-old-messages", async (job) => {
  const { daysOld = 365 } = job.data; // Default: messages older than 1 year

  try {
    logger.info(
      `Processing message cleanup: deleting messages older than ${daysOld} days`
    );

    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const deletedMessages = await Message.deleteMany({
      timestamp: { $lt: cutoffDate },
      deleted: true, // Only delete messages that are already soft-deleted
    });

    logger.info(
      `Message cleanup completed. Deleted: ${deletedMessages.deletedCount} messages`
    );

    return {
      success: true,
      deletedMessages: deletedMessages.deletedCount,
      cutoffDate,
    };
  } catch (error) {
    logger.error("Message cleanup job failed:", error);
    throw error;
  }
});

// Process user statistics update
messageQueue.process("update-message-stats", async (job) => {
  const { userId } = job.data;

  try {
    logger.info(`Updating message statistics for user: ${userId}`);

    // Calculate message statistics
    const sentCount = await Message.countDocuments({
      sender: userId,
      deleted: { $ne: true },
    });

    const receivedCount = await Message.countDocuments({
      receiver: userId,
      deleted: { $ne: true },
    });

    const lastMessage = await Message.findOne({
      $or: [{ sender: userId }, { receiver: userId }],
      deleted: { $ne: true },
    }).sort({ timestamp: -1 });

    // Update user statistics
    await User.findByIdAndUpdate(userId, {
      messageStats: {
        totalSent: sentCount,
        totalReceived: receivedCount,
        lastMessageAt: lastMessage ? lastMessage.timestamp : null,
      },
    });

    logger.info(`Message statistics updated for user: ${userId}`);

    return {
      success: true,
      userId,
      stats: {
        totalSent: sentCount,
        totalReceived: receivedCount,
        lastMessageAt: lastMessage ? lastMessage.timestamp : null,
      },
    };
  } catch (error) {
    logger.error(`Message stats update job failed for user ${userId}:`, error);
    throw error;
  }
});

// Process conversation analytics (for admin dashboard)
messageQueue.process("generate-conversation-analytics", async (job) => {
  try {
    logger.info("Generating conversation analytics");

    // Calculate platform-wide message statistics
    const totalMessages = await Message.countDocuments({
      deleted: { $ne: true },
    });
    const totalConversations = (await Message.distinct("conversationId"))
      .length;

    // Messages in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const messagesLast24h = await Message.countDocuments({
      timestamp: { $gte: yesterday },
      deleted: { $ne: true },
    });

    // Messages in last 7 days
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const messagesLastWeek = await Message.countDocuments({
      timestamp: { $gte: lastWeek },
      deleted: { $ne: true },
    });

    // Most active conversations
    const activeConversations = await Message.aggregate([
      { $match: { deleted: { $ne: true } } },
      { $group: { _id: "$conversationId", messageCount: { $sum: 1 } } },
      { $sort: { messageCount: -1 } },
      { $limit: 10 },
    ]);

    // Most active users (by messages sent)
    const activeUsers = await Message.aggregate([
      { $match: { deleted: { $ne: true } } },
      {
        $group: {
          _id: "$sender",
          messagesSent: { $sum: 1 },
          lastMessage: { $max: "$timestamp" },
        },
      },
      { $sort: { messagesSent: -1 } },
      { $limit: 10 },
    ]);

    // Messages by user role
    const messagesByRole = await Message.aggregate([
      { $match: { deleted: { $ne: true } } },
      {
        $lookup: {
          from: "users",
          localField: "sender",
          foreignField: "_id",
          as: "senderInfo",
        },
      },
      { $unwind: "$senderInfo" },
      {
        $group: {
          _id: "$senderInfo.role",
          count: { $sum: 1 },
        },
      },
    ]);

    const analytics = {
      totalMessages,
      totalConversations,
      messagesLast24h,
      messagesLastWeek,
      activeConversations,
      activeUsers,
      messagesByRole,
      generatedAt: new Date(),
    };

    logger.info("Conversation analytics generated successfully");

    return { success: true, analytics };
  } catch (error) {
    logger.error("Conversation analytics job failed:", error);
    throw error;
  }
});

// Process unread message count updates
messageQueue.process("update-unread-counts", async (job) => {
  try {
    logger.info("Updating unread message counts for all users");

    // Get all users who have received messages
    const usersWithMessages = await Message.distinct("receiver");

    let updatedUsers = 0;

    for (const userId of usersWithMessages) {
      const unreadCount = await Message.countDocuments({
        receiver: userId,
        read: false,
        deleted: { $ne: true },
      });

      // You can store this in user model if needed, or use it for other purposes
      // For now, just log it
      logger.debug(`User ${userId} has ${unreadCount} unread messages`);
      updatedUsers++;
    }

    logger.info(`Unread count update completed for ${updatedUsers} users`);

    return {
      success: true,
      updatedUsers,
    };
  } catch (error) {
    logger.error("Unread count update job failed:", error);
    throw error;
  }
});

// Job scheduling functions
const addMessageCleanupJob = (daysOld = 365) => {
  return messageQueue.add(
    "cleanup-old-messages",
    { daysOld },
    {
      repeat: { cron: "0 2 * * 0" }, // Weekly on Sunday at 2 AM
      attempts: 1,
    }
  );
};

const addMessageStatsJob = (userId) => {
  return messageQueue.add(
    "update-message-stats",
    { userId },
    {
      attempts: 2,
      delay: 1000,
    }
  );
};

const addConversationAnalyticsJob = () => {
  return messageQueue.add(
    "generate-conversation-analytics",
    {},
    {
      repeat: { cron: "0 1 * * *" }, // Daily at 1 AM
      attempts: 1,
    }
  );
};

const addUnreadCountUpdateJob = () => {
  return messageQueue.add(
    "update-unread-counts",
    {},
    {
      repeat: { cron: "*/30 * * * *" }, // Every 30 minutes
      attempts: 1,
    }
  );
};

// Error handling
messageQueue.on("failed", (job, err) => {
  logger.error(`Message job ${job.id} failed:`, err);
});

messageQueue.on("completed", (job, result) => {
  logger.debug(`Message job ${job.id} completed:`, result);
});

// Initialize recurring jobs (call this once when server starts)
const initializeMessageJobs = async () => {
  try {
    // Clean up old recurring jobs first
    await messageQueue.clean(0, "completed");
    await messageQueue.clean(0, "failed");

    // Add recurring jobs
    await addMessageCleanupJob();
    await addConversationAnalyticsJob();
    await addUnreadCountUpdateJob();

    logger.info("Message background jobs initialized");
  } catch (error) {
    logger.error("Failed to initialize message jobs:", error);
  }
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  await messageQueue.close();
});

module.exports = {
  messageQueue,
  addMessageCleanupJob,
  addMessageStatsJob,
  addConversationAnalyticsJob,
  addUnreadCountUpdateJob,
  initializeMessageJobs,
};
