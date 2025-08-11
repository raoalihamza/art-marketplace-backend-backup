const Message = require("../models/Message");
const User = require("../models/User");
const messageService = require("../services/messageService");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");

// send a message
const sendMessage = async (req, res, next) => {
  try {
    const senderId = req.user.id;
    const { receiverId, content } = req.body;

    // Check if the receiver exists and has different role
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return next(new AppError("Receiver not found", 404));
    }

    // Ensure users have different roles (artist ↔ buyer only)
    if (req.user.role === receiver.role) {
      return next(
        new AppError(
          "You cannot send messages to users with the same role",
          403
        )
      );
    }

    // Check if the sender is blocked by the receiver
    if (receiver.blockedUsers && receiver.blockedUsers.includes(senderId)) {
      return next(new AppError("Unable to send message", 403));
    }

    // Check if receiver is blocked by sender
    if (req.user.blockedUsers && req.user.blockedUsers.includes(receiverId)) {
      return next(new AppError("You have blocked the receiver", 403));
    }

    const result = await messageService.sendMessage(
      senderId,
      receiverId,
      content
    );

    res.status(201).json({
      status: "success",
      message: "Message sent successfully",
      data: {
        message: result.message,
        conversation: result.conversation,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in sendMessage controller: ${error.message}`);
  }
};

// Get user's conversations
const getConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const result = await messageService.getUserConversations(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.status(200).json({
      status: "success",
      results: result.conversations.length,
      data: {
        conversations: result.conversations,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getConversation controller: ${error.message}`);
  }
};

// Get messages in a specific conversation
const getConversationMessages = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { userId: otherUserId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // verify the other user exists and has a different role
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return next(new AppError("User not found", 404));
    }

    if (req.user.role === otherUser.role) {
      return next(
        new AppError(
          "You cannot view messages with users of the same role",
          403
        )
      );
    }

    const result = await messageService.getConversationMessages(
      userId,
      otherUserId,
      {
        page: parseInt(page),
        limit: parseInt(limit),
      }
    );

    res.status(200).json({
      status: "success",
      results: result.messages.length,
      data: {
        messages: result.messages,
        pagination: result.pagination,
        otherUser: {
          id: otherUser._id,
          name: otherUser.name,
          role: otherUser.role,
          isOnline: otherUser.isOnline || false,
          lastSeen: otherUser.lastSeen,
        },
      },
    });
  } catch (error) {
    next(error);
    logger.error(
      `Error in getConversationMessages controller: ${error.message}`
    );
  }
};

// Mark messages as read
const markMessagesAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { userId: otherUserId } = req.params;

    const result = await messageService.markMessagesAsRead(userId, otherUserId);

    res.status(200).json({
      status: "success",
      message: "Messages marked as read successfully",
    });
  } catch (error) {
    next(error);
    logger.error(`Error in markMessagesAsRead controller: ${error.message}`);
  }
};

// Delete a message (soft delete)
const deleteMessage = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    const result = await messageService.deleteMessage(messageId, userId);

    res.status(200).json({
      status: "success",
      message: "Message deleted successfully",
    });
  } catch (error) {
    next(error);
    logger.error(`Error in deleteMessage controller: ${error.message}`);
  }
};

// Block/Unblock user
const toggleBlockUser = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { userId: targetUserId } = req.params;

    // Check if the target user exists and has a different role
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return next(new AppError("User not found", 404));
    }

    if (req.user.role === targetUser.role) {
      return next(
        new AppError("You cannot block users with the same role", 403)
      );
    }

    const result = await messageService.toggleBlockUser(userId, targetUserId);

    res.status(200).json({
      status: "success",
      message:
        result.action === "blocked"
          ? "User blocked successfully"
          : "User unblocked successfully",
      data: {
        action: result.action,
        blockedUsers: result.blockedUsers,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in toggleBlockUser controller: ${error.message}`);
  }
};

// Get unread message count
const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch unread message count for the user
    const unreadCount = await Message.countDocuments({
      receiver: userId,
      read: false,
      deleted: { $ne: true },
    });

    res.status(200).json({
      status: "success",
      data: {
        unreadCount,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in getUnreadCount controller: ${error.message}`);
  }
};

// Search conversations
const searchConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { query: searchQuery, page = 1, limit = 10 } = req.query;

    if (!searchQuery || searchQuery.trim().length === 0) {
      return next(new AppError("Search query is required", 400));
    }

    const result = await messageService.searchConversations(
      userId,
      searchQuery,
      {
        page: parseInt(page),
        limit: parseInt(limit),
      }
    );

    res.status(200).json({
      status: "success",
      results: result.conversations.length,
      data: {
        conversations: result.conversations,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
    logger.error(`Error in searchConversations controller: ${error.message}`);
  }
};

const searchWithinConversation = async (req, res, next) => {
  try {
    const { userId: otherUserId } = req.params;
    const { query: searchQuery, page = 1, limit = 20 } = req.query;

    if (!searchQuery || searchQuery.trim().length === 0) {
      return next(new AppError("Search query is required", 400));
    }

    // Verify other user exists and has different role
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return next(new AppError("User not found", 404));
    }

    if (req.user.role === otherUser.role) {
      return next(
        new AppError("Cannot search messages with users of same role", 403)
      );
    }

    const result = await messageService.searchWithinConversation(
      req.user.id,
      otherUserId,
      searchQuery,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      status: "success",
      results: result.messages.length,
      data: {
        messages: result.messages,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendMessage,
  getConversations,
  getConversationMessages,
  markMessagesAsRead,
  deleteMessage,
  toggleBlockUser,
  getUnreadCount,
  searchConversations,
  searchWithinConversation,
};
