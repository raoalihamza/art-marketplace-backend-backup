const User = require("../models/User");
const Artwork = require("../models/Artwork");
const Transaction = require("../models/Transaction");
const Message = require("../models/Message");
const adminService = require("../services/adminService");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

// Approve Artwork
const approveArtwork = async (req, res, next) => {
  try {
    const { id: artworkId } = req.params;
    const adminId = req.user.id;

    const result = await adminService.approveArtwork(artworkId, adminId);

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        artwork: result.artwork,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in approveArtwork controller: ${error.message}`);
  }
};

// Reject Artwork
const rejectArtwork = async (req, res, next) => {
  try {
    const { id: artworkId } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.user.id;

    if (!rejectionReason || rejectionReason.trim().length === 0) {
      return next(new AppError("Rejection reason is required", 400));
    }

    const result = await adminService.rejectArtwork(
      artworkId,
      adminId,
      rejectionReason
    );

    res.status(200).json({
      status: "success",
      message: result.message,
      data: {
        artwork: result.artwork,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in rejectArtwork controller: ${error.message}`);
  }
};

// Get pending artworks
const getPendingArtworks = async (req, res, next) => {
  try {
    const result = await adminService.getPendingArtworks(req.query);

    res.status(200).json({
      status: "success",
      results: result.artworks.length,
      data: {
        artworks: result.artworks,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getPendingArtworks controller: ${error.message}`);
  }
};

// Get artwork statistics
const getArtworkStats = async (req, res, next) => {
  try {
    const stats = await adminService.getArtworkStats();

    res.status(200).json({
      status: "success",
      data: {
        stats,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getArtworkStats controller: ${error.message}`);
  }
};

// Get user statistics
const getUserStats = async (req, res, next) => {
  try {
    const stats = await adminService.getUserStats();

    res.status(200).json({
      status: "success",
      data: {
        stats,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getUserStats controller: ${error.message}`);
  }
};

// Get platform overview
const getPlatformOverview = async (req, res, next) => {
  try {
    const overview = await adminService.getPlatformOverview();

    res.status(200).json({
      status: "success",
      data: overview,
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getPlatformOverview controller: ${error.message}`);
  }
};

// Get all users (for admin management)
const getAllUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      isVerified,
      search,
      sort = "-createdAt",
    } = req.query;

    // Build filter
    const filter = {};

    if (role && ["artist", "buyer", "admin"].includes(role)) {
      filter.role = role;
    }

    if (isVerified !== undefined) {
      filter.isVerified = isVerified === "true";
    }

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    // parse sort
    const sortObj = {};
    if (sort.startsWith("-")) {
      sortObj[sort.substring(1)] = -1;
    } else {
      sortObj[sort] = 1;
    }

    const users = await User.find(filter)
      .select("-password -verificationOTP -passwordResetToken")
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(filter);

    res.status(200).json({
      status: "success",
      results: users.length,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: skip + limit < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getAllUsers controller: ${error.message}`);
  }
};

// Get all artworks for admin (including all statuses)
const getAllArtworks = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      artist,
      sort = "-createdAt",
    } = req.query;

    // Build filter
    const filter = {};

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    if (artist) {
      filter.artist = artist;
    }

    if (search) {
      filter.$text = {
        $search: search,
        $caseSensitive: false,
      };
    }

    const skip = (page - 1) * limit;

    // Parse sort
    const sortObj = {};
    if (sort.startsWith("-")) {
      sortObj[sort.substring(1)] = -1;
    } else {
      sortObj[sort] = 1;
    }

    const artworks = await Artwork.find(filter)
      .populate("artist", "username email profile")
      .populate("currentOwner", "username email")
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Artwork.countDocuments(filter);

    res.status(200).json({
      status: "success",
      results: artworks.length,
      data: {
        artworks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: skip + limit < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getAllArtworks controller: ${error.message}`);
  }
};

// Get all transactions for admin
const getAllTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      sort = "-timestamp",
    } = req.query;

    // Build filter
    const filter = {};

    if (type && ["listing_fee", "sale"].includes(type)) {
      filter.transactionType = type;
    }

    if (
      status &&
      ["pending", "completed", "failed", "refunded"].includes(status)
    ) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    // Parse sort
    const sortObj = {};
    if (sort.startsWith("-")) {
      sortObj[sort.substring(1)] = -1;
    } else {
      sortObj[sort] = 1;
    }

    const transactions = await Transaction.find(filter)
      .populate("artwork", "title images price")
      .populate("buyer", "username email")
      .populate("seller", "username email")
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    const total = await Transaction.countDocuments(filter);

    res.status(200).json({
      status: "success",
      results: transactions.length,
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: skip + limit < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getAllTransactions controller: ${error.message}`);
  }
};

const getMessageAnalytics = async (req, res, next) => {
  try {
    const { period = "week" } = req.query;

    let dateFilter = {};
    const now = new Date();

    switch (period) {
      case "day":
        dateFilter.timestamp = {
          $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        };
        break;
      case "week":
        dateFilter.timestamp = {
          $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        };
        break;
      case "month":
        dateFilter.timestamp = {
          $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        };
        break;
      case "year":
        dateFilter.timestamp = {
          $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
        };
        break;
    }

    // Basic message statistics
    const totalMessages = await Message.countDocuments({
      ...dateFilter,
      deleted: { $ne: true },
    });

    const totalConversations = (
      await Message.distinct("conversationId", {
        ...dateFilter,
        deleted: { $ne: true },
      })
    ).length;

    // Messages by role
    const messagesByRole = await Message.aggregate([
      { $match: { ...dateFilter, deleted: { $ne: true } } },
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

    // Active conversations (most messages) - FIXED VERSION
    const activeConversations = await Message.aggregate([
      { $match: { ...dateFilter, deleted: { $ne: true } } },
      {
        $group: {
          _id: "$conversationId",
          messageCount: { $sum: 1 },
          senders: { $addToSet: "$sender" },
          receivers: { $addToSet: "$receiver" },
          lastMessage: { $max: "$timestamp" },
        },
      },
      {
        $addFields: {
          participantCount: {
            $size: {
              $setUnion: ["$senders", "$receivers"],
            },
          },
        },
      },
      { $sort: { messageCount: -1 } },
      { $limit: 10 },
      {
        $project: {
          conversationId: "$_id",
          messageCount: 1,
          participantCount: 1,
          lastMessage: 1,
          _id: 0,
        },
      },
    ]);

    // Messages over time (daily breakdown)
    const messagesOverTime = await Message.aggregate([
      { $match: { ...dateFilter, deleted: { $ne: true } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Flagged messages (if you implement content flagging)
    const flaggedMessages = await Message.countDocuments({
      ...dateFilter,
      flagged: true,
    });

    res.status(200).json({
      status: "success",
      data: {
        period,
        overview: {
          totalMessages,
          totalConversations,
          flaggedMessages,
        },
        messagesByRole,
        activeConversations,
        messagesOverTime,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getMessageAnalytics controller: ${error.message}`);
  }
};

// Get all messages for admin moderation
const getAllMessages = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      flagged,
      conversationId,
      userId,
      sort = "-timestamp",
    } = req.query;

    // Build filter
    const filter = { deleted: { $ne: true } };

    if (flagged === "true") {
      filter.flagged = true;
    }

    if (conversationId) {
      filter.conversationId = conversationId;
    }

    if (userId) {
      filter.$or = [{ sender: userId }, { receiver: userId }];
    }

    if (search) {
      filter.content = { $regex: search, $options: "i" };
    }

    const skip = (page - 1) * limit;

    // Parse sort
    const sortObj = {};
    if (sort.startsWith("-")) {
      sortObj[sort.substring(1)] = -1;
    } else {
      sortObj[sort] = 1;
    }

    const messages = await Message.find(filter)
      .populate("sender", "username email role")
      .populate("receiver", "username email role")
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Message.countDocuments(filter);

    res.status(200).json({
      status: "success",
      results: messages.length,
      data: {
        messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: skip + limit < total,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getAllMessages controller: ${error.message}`);
  }
};

// Flag/unflag a message
const toggleMessageFlag = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { reason } = req.body;

    const message = await Message.findById(messageId);
    if (!message) {
      return next(new AppError("Message not found", 404));
    }

    message.flagged = !message.flagged;
    if (message.flagged && reason) {
      message.flagReason = reason;
      message.flaggedBy = req.user.id;
      message.flaggedAt = new Date();
    } else if (!message.flagged) {
      message.flagReason = undefined;
      message.flaggedBy = undefined;
      message.flaggedAt = undefined;
    }

    await message.save();

    res.status(200).json({
      status: "success",
      message: message.flagged
        ? "Message flagged successfully"
        : "Message unflagged successfully",
      data: {
        message: {
          id: message._id,
          flagged: message.flagged,
          flagReason: message.flagReason,
          flaggedAt: message.flaggedAt,
        },
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in toggleMessageFlag controller: ${error.message}`);
  }
};

// Delete a message (admin force delete)
const adminDeleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { reason } = req.body;

    const message = await Message.findById(messageId);
    if (!message) {
      return next(new AppError("Message not found", 404));
    }

    // Admin force delete
    message.deleted = true;
    message.deletedAt = new Date();
    message.deletedBy = req.user.id;
    message.deletionReason = reason || "Deleted by admin";

    await message.save();

    res.status(200).json({
      status: "success",
      message: "Message deleted successfully",
    });
  } catch (error) {
    next(error);
    logger.error(`Error in adminDeleteMessage controller: ${error.message}`);
  }
};

// Get conversation details
const getConversationDetails = async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    const messages = await Message.find({
      conversationId,
      deleted: { $ne: true },
    })
      .populate("sender", "username email role")
      .populate("receiver", "username email role")
      .sort({ timestamp: 1 })
      .lean();

    if (messages.length === 0) {
      return next(new AppError("Conversation not found", 404));
    }

    // Get participants
    const participants = [];
    const participantIds = new Set();

    messages.forEach((msg) => {
      if (!participantIds.has(msg.sender._id.toString())) {
        participants.push(msg.sender);
        participantIds.add(msg.sender._id.toString());
      }
      if (!participantIds.has(msg.receiver._id.toString())) {
        participants.push(msg.receiver);
        participantIds.add(msg.receiver._id.toString());
      }
    });

    // Calculate statistics
    const stats = {
      totalMessages: messages.length,
      flaggedMessages: messages.filter((msg) => msg.flagged).length,
      startDate: messages[0].timestamp,
      lastMessage: messages[messages.length - 1].timestamp,
      messagesByParticipant: {},
    };

    participants.forEach((participant) => {
      stats.messagesByParticipant[participant._id] = {
        username: participant.username,
        role: participant.role,
        count: messages.filter(
          (msg) => msg.sender._id.toString() === participant._id.toString()
        ).length,
      };
    });

    res.status(200).json({
      status: "success",
      data: {
        conversationId,
        participants,
        messages,
        stats,
      },
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in getConversationDetails controller: ${error.message}`
    );
  }
};

// Get traceability overview for admin dashboard
const getTraceabilityOverview = async (req, res, next) => {
  try {
    const traceabilityService = require("../services/traceabilityService");
    const overview = await traceabilityService.getTraceabilityStats();

    res.status(200).json({
      status: "success",
      data: {
        traceability: overview,
      },
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in getTraceabilityOverview controller: ${error.message}`
    );
  }
};

module.exports = {
  approveArtwork,
  rejectArtwork,
  getPendingArtworks,
  getArtworkStats,
  getUserStats,
  getPlatformOverview,
  getAllUsers,
  getAllArtworks,
  getAllTransactions,
  getMessageAnalytics,
  getAllMessages,
  toggleMessageFlag,
  adminDeleteMessage,
  getConversationDetails,
  getTraceabilityOverview,
};
