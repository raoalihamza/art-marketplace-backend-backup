const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/User");
const AppError = require("../utils/appError");
const logger = require("../utils/logger");
const { filterProfanity } = require("../utils/contentFilter.js");

class MessageService {
  async sendMessage(senderId, receiverId, content) {
    try {
      // Filter content for profanity and contact information
      const filteredContent = this.filterMessageContent(content);

      // create conversation id
      const conversationId = Message.createConversationId(senderId, receiverId);

      // Create message
      const message = await Message.create({
        sender: senderId,
        receiver: receiverId,
        content: filteredContent,
        conversationId,
        timestamp: new Date(),
        read: false,
      });

      // Populate sender and receiver info
      await message.populate([
        { path: "sender", select: "username role" },
        { path: "receiver", select: "username role isOnline lastSeen" },
      ]);

      // Update last message timestamp for both users
      await this.updateLastMessageTimestamp(conversationId);

      logger.info(`Message sent from ${senderId} to ${receiverId}`);

      return {
        message: {
          id: message._id,
          content: message.content,
          sender: message.sender,
          receiver: message.receiver,
          timestamp: message.timestamp,
          read: message.read,
          conversationId: message.conversationId,
        },
        conversation: {
          conversationId,
          otherUser: message.receiver,
        },
      };
    } catch (error) {
      logger.error(`Error in sendMessage service: ${error.message}`);
      throw new AppError("Failed to send message", 500);
    }
  }

  // Get user's conversations with pagination
  async getUserConversations(userId, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      // get all conversations IDs for the user
      const conversationIds = await Message.distinct("conversationId", {
        $or: [{ sender: userId }, { receiver: userId }],
        deleted: { $ne: true },
      });

      // Get last message for each conversation with other user info
      const conversations = [];

      for (const conversationId of conversationIds) {
        // Get the last message in this conversation
        const lastMessage = await Message.findOne({
          conversationId,
          deleted: { $ne: true },
        })
          .sort({ timestamp: -1 })
          .populate("sender receiver", "username role isOnline lastSeen")
          .lean();

        if (lastMessage) {
          // Determine the other user
          const otherUserId =
            lastMessage.sender._id.toString() === userId
              ? lastMessage.receiver
              : lastMessage.sender;

          // get unread count for this conversation
          const unreadCount = await Message.countDocuments({
            conversationId,
            receiver: userId,
            read: false,
            deleted: { $ne: true },
          });

          conversations.push({
            conversationId,
            otherUser: {
              id: otherUserId._id,
              username: otherUserId.username,
              role: otherUserId.role,
              isOnline: otherUserId.isOnline || false,
              lastSeen: otherUserId.lastSeen,
            },
            lastMessage: {
              id: lastMessage._id,
              content: lastMessage.content,
              timestamp: lastMessage.timestamp,
              senderId: lastMessage.sender._id,
              isSentByMe: lastMessage.sender._id.toString() === userId,
            },
            unreadCount,
            updatedAt: lastMessage.timestamp,
          });
        }
      }

      // Sort by last message timestamp
      conversations.sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
      );

      // Apply pagination
      const paginatedConversations = conversations.slice(skip, skip + limit);
      const total = conversations.length;

      return {
        conversations: paginatedConversations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: skip + limit < total,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      logger.error(`Error in getUserConversations service: ${error.message}`);
      throw new AppError("Failed to retrieve conversations", 500);
    }
  }

  // Get messages in a conversation
  async getConversationMessages(userId, otherUserId, options = {}) {
    try {
      const { page = 1, limit = 50 } = options;
      const skip = (page - 1) * limit;

      const conversationId = Message.createConversationId(userId, otherUserId);

      // Get messages with pagination
      const messages = await Message.find({
        conversationId,
        deleted: { $ne: true },
      })
        .sort({ timestamp: 1 })
        .skip(skip)
        .limit(limit)
        .populate("sender receiver", "username role")
        .lean();

      // Format messages
      const formattedMessages = messages.map((message) => ({
        id: message._id,
        content: message.content,
        sender: message.sender,
        receiver: message.receiver,
        timestamp: message.timestamp,
        read: message.read,
        isSentByMe: message.sender._id.toString() === userId,
      }));

      const total = await Message.countDocuments({ conversationId });

      return {
        messages: formattedMessages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: skip + limit < total,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      logger.error(
        `Error in getConversationMessages service: ${error.message}`
      );
      throw new AppError("Failed to retrieve conversation messages", 500);
    }
  }

  // Mark messages as read
  async markMessagesAsRead(userId, otherUserId) {
    try {
      const conversationId = Message.createConversationId(userId, otherUserId);

      await Message.updateMany(
        { conversationId, receiver: userId, read: false },
        { read: true, readAt: new Date() }
      );

      logger.info(
        `Messages marked as read for user ${userId} in conversation ${conversationId}`
      );
    } catch (error) {
      logger.error("Error marking messages as read:", error);
      throw error;
    }
  }

  // Delete a message (soft delete)
  async deleteMessage(messageId, userId) {
    try {
      const message = await Message.findById(messageId);

      if (!message) {
        throw new AppError("Message not found", 404);
      }

      // check if the user is the sender
      if (message.sender.toString() !== userId) {
        throw new AppError("You can only delete your own messages", 403);
      }

      // Soft delete the message
      message.deleted = true;
      message.deletedAt = new Date();
      await message.save();

      logger.info(`Message ${messageId} deleted by user ${userId}`);
    } catch (error) {
      logger.error(`Error in deleteMessage service: ${error.message}`);
      throw new AppError("Failed to delete message", 500);
    }
  }

  // Block/Unblock user
  async toggleBlockUser(userId, targetUserId) {
    try {
      const user = await User.findById(userId);

      if (!user.blockedUsers) {
        user.blockedUsers = [];
      }

      const isBlocked = user.blockedUsers.includes(targetUserId);

      if (isBlocked) {
        // Unblock user
        user.blockedUsers = user.blockedUsers.filter(
          (id) => id.toString() !== targetUserId.toString()
        );
        await user.save();

        logger.info(`User ${userId} unblocked ${targetUserId}`);
        return {
          action: "unblocked",
          blockedUsers: user.blockedUsers,
        };
      } else {
        // Block user
        user.blockedUsers.push(targetUserId);
        await user.save();

        logger.info(`User ${targetUserId} blocked by ${userId}`);
        return { action: "blocked", blockedUsers: user.blockedUsers };
      }
    } catch (error) {
      logger.error(`Error in toggleBlockUser service: ${error.message}`);
      throw new AppError("Failed to toggle block user", 500);
    }
  }

  // Search conversations
  async searchConversations(userId, searchQuery, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      // Search in messages and get unique conversation IDs
      const messageResults = await Message.find({
        $or: [{ sender: userId }, { receiver: userId }],
        content: { $regex: searchQuery, $options: "i" },
        deleted: { $ne: true },
      })
        .populate("sender receiver", "username role")
        .sort({ timestamp: -1 })
        .lean();

      // Group by conversation and get unique conversations
      const conversationMap = new Map();

      messageResults.forEach((message) => {
        const conversationId = message.conversationId;
        if (!conversationMap.has(conversationId)) {
          const otherUser =
            message.sender._id.toString() === userId
              ? message.receiver
              : message.sender;

          conversationMap.set(conversationId, {
            conversationId,
            otherUser,
            matchingMessage: message,
            timestamp: message.timestamp,
          });
        }
      });

      // Convert to array and apply pagination
      const conversations = Array.from(conversationMap.values())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(skip, skip + limit);

      const total = conversationMap.size;

      return {
        conversations: conversations.map((conv) => ({
          conversationId: conv.conversationId,
          otherUser: {
            id: conv.otherUser._id,
            username: conv.otherUser.username,
            role: conv.otherUser.role,
          },
          matchingMessage: {
            content: conv.matchingMessage.content,
            timestamp: conv.matchingMessage.timestamp,
          },
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: skip + limit < total,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      logger.error(`Error in searchConversations service: ${error.message}`);
      throw new AppError("Failed to search conversations", 500);
    }
  }

  // Filter message content for profanity and contact information
  filterMessageContent(content) {
    // Remove potential contact information patterns
    let filteredContent = content;

    // Remove email patterns
    filteredContent = filteredContent.replace(
      /[\w\.-]+@[\w\.-]+\.\w+/g,
      "[CONTACT INFO REMOVED]"
    );

    // Remove phone number patterns
    filteredContent = filteredContent.replace(
      /(\+?\d{1,4}[\s\-]?)?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{1,9}/g,
      "[CONTACT INFO REMOVED]"
    );

    // Remove social media handles
    filteredContent = filteredContent.replace(
      /@[a-zA-Z0-9_]+/g,
      "[SOCIAL HANDLE REMOVED]"
    );

    // Remove URLs
    filteredContent = filteredContent.replace(
      /(https?:\/\/[^\s]+)/g,
      "[LINK REMOVED]"
    );

    // Filter profanity (you can implement this based on your requirements)
    filteredContent = filterProfanity(filteredContent);

    return filteredContent;
  }

  // Update last message timestamp for conversation tracking
  async updateLastMessageTimestamp(conversationId) {
    try {
      // This can be used for conversation sorting and caching
      // For now, we rely on message timestamps
      logger.debug(
        `Updated last message timestamp for conversation ${conversationId}`
      );
    } catch (error) {
      logger.error("Error updating last message timestamp:", error);
    }
  }

  // Get conversation statistics for analytics
  async getConversationStats(userId) {
    try {
      const totalConversations = await Message.distinct("conversationId", {
        $or: [{ sender: userId }, { receiver: userId }],
        deleted: { $ne: true },
      }).length;

      const totalMessages = await Message.countDocuments({
        $or: [{ sender: userId }, { receiver: userId }],
        deleted: { $ne: true },
      });

      const unreadMessages = await Message.countDocuments({
        receiver: userId,
        read: false,
        deleted: { $ne: true },
      });

      return {
        totalConversations,
        totalMessages,
        unreadMessages,
      };
    } catch (error) {
      logger.error("Error getting conversation stats:", error);
      throw error;
    }
  }

  // Search within a specific conversation
  async searchWithinConversation(
    userId,
    otherUserId,
    searchQuery,
    page = 1,
    limit = 20
  ) {
    try {
      const conversationId = Message.createConversationId(userId, otherUserId);
      const skip = (page - 1) * limit;

      const messages = await Message.find({
        conversationId,
        content: { $regex: searchQuery, $options: "i" },
        deleted: { $ne: true },
      })
        .populate("sender receiver", "username role")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Message.countDocuments({
        conversationId,
        content: { $regex: searchQuery, $options: "i" },
        deleted: { $ne: true },
      });

      return {
        messages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error("Error searching within conversation:", error);
      throw error;
    }
  }
}

module.exports = new MessageService();
