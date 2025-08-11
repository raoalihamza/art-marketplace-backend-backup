const Message = require("../models/Message");
const User = require("../models/User");
const messageService = require("../services/messageService");
const logger = require("../utils/logger");
const { analyzeContentSafety } = require("../utils/contentFilter");

class ChatHandler {
  constructor() {
    this.activeTyping = new Map(); // Store active typing indicators
    this.userRooms = new Map(); // Track user's active conversation rooms
  }

  // Set up all chat-related event handlers
  setupChatHandlers(socket, io) {
    // All handlers are set up in the main socket index file
    // This method can be used for any additional setup if needed
    logger.debug(`Chat handlers set up for user ${socket.user.id}`);
  }

  // Handle user joining a conversation room
  joinConversation(socket, data) {
    try {
      const { otherUserId } = data;

      if (!otherUserId || otherUserId === socket.user.id) {
        logger.error(
          `Invalid join request from user ${socket.user.id} for conversation with ${otherUserId}`
        );
        socket.emit("error", { message: "Invalid conversation data" });
        return;
      }

      // Create conversation room ID
      const conversationId = Message.createConversationId(
        socket.user.id,
        otherUserId
      );
      const roomName = `conversation_${conversationId}`;

      // Join the room
      socket.join(roomName);

      // track the room for cleanup
      if (!this.userRooms.has(socket.user.id)) {
        this.userRooms.set(socket.user.id, new Set());
      }
      this.userRooms.get(socket.user.id).add(roomName);

      socket.emit("conversation_joined", {
        conversationId,
        otherUserId,
        roomName,
      });
      logger.debug(
        `User ${socket.user.id} joined conversation room: ${roomName}`
      );
    } catch (error) {
      logger.error(`Error joining conversation: ${error.message}`);
      socket.emit("error", { message: "Failed to join conversation" });
    }
  }

  // Handle user leaving a conversation room
  leaveConversation(socket, data) {
    try {
      const { otherUserId } = data;

      if (!otherUserId) {
        return;
      }

      const conversationId = Message.createConversationId(
        socket.user.id,
        otherUserId
      );
      const roomName = `conversation_${conversationId}`;

      // Leave the room
      socket.leave(roomName);

      // Remove from tracking
      if (this.userRooms.has(socket.user.id)) {
        this.userRooms.get(socket.user.id).delete(roomName);
      }

      // Stop any typing indicator
      this.stopTyping(socket, otherUserId);

      socket.emit("conversation_left", {
        conversationId,
        otherUserId,
      });

      logger.debug(
        `User ${socket.user.id} left conversation room: ${roomName}`
      );
    } catch (error) {
      logger.error(`Error leaving conversation: ${error.message}`);
    }
  }

  // Handle typing start indicator
  handleTypingStart(socket, io, data) {
    try {
      const { otherUserId } = data;

      if (!otherUserId || otherUserId === socket.user.id) {
        return;
      }

      // create a typing key
      const typingKey = `${socket.user.id}_${otherUserId}`;

      // Set typing indicator with timeout
      if (this.activeTyping.has(typingKey)) {
        clearTimeout(this.activeTyping.get(typingKey));
      }

      // Auto-stop typing after 3 seconds of inactivity
      const timeout = setTimeout(() => {
        this.stopTyping(socket, otherUserId);
      }, 3000);

      this.activeTyping.set(typingKey, timeout);

      // Notify the other user
      const otherUserRoom = `user_${otherUserId}`;
      io.to(otherUserRoom).emit("user_typing", {
        userId: socket.user.id,
        username: socket.user.username,
        isTyping: true,
      });
      logger.debug(`User ${socket.user.id} started typing to ${otherUserId}`);
    } catch (error) {
      logger.error(`Error handling typing start: ${error.message}`);
    }
  }

  // Handle typing stop indicator
  handleTypingStop(socket, io, data) {
    try {
      const { otherUserId } = data;
      this.stopTyping(socket, otherUserId, io);
    } catch (error) {
      logger.error(`Error handling typing stop: ${error.message}`);
    }
  }

  stopTyping(socket, otherUserId, io = null) {
    try {
      if (!otherUserId) {
        return;
      }

      const typingKey = `${socket.user.id}_${otherUserId}`;

      // clear timeout
      if (this.activeTyping.has(typingKey)) {
        clearTimeout(this.activeTyping.get(typingKey));
        this.activeTyping.delete(typingKey);
      }

      // Notify other user if io is available
      if (io) {
        const otherUserRoom = `user_${otherUserId}`;
        io.to(otherUserRoom).emit("user_typing", {
          userId: socket.user.id,
          username: socket.user.username,
          isTyping: false,
        });
      }

      logger.debug(`User ${socket.user.id} stopped typing to ${otherUserId}`);
    } catch (error) {
      logger.error(`Error stopping typing: ${error.message}`);
    }
  }

  // Handle sending a message via socket
  async handleSendMessage(socket, io, data) {
    try {
      const { receiverId, content } = data;

      if (!receiverId || !content || receiverId === socket.user.id) {
        socket.emit("message_error", { message: "Invalid message data" });
        return;
      }

      // Verify receiver exists and has different role
      const receiver = await User.findById(receiverId);
      if (!receiver) {
        socket.emit("message_error", { message: "Receiver not found" });
        return;
      }

      if (socket.user.role === receiver.role) {
        socket.emit("message_error", {
          message: "You can only message users with different roles",
        });
        return;
      }

      // Check if users are blocked
      if (
        receiver.blockedUsers &&
        receiver.blockedUsers.includes(socket.user.id)
      ) {
        socket.emit("message_error", { message: "Unable to send message" });
        return;
      }

      // Analyze content safety
      const safetyAnalysis = analyzeContentSafety(content);
      if (!safetyAnalysis.isAcceptable) {
        socket.emit("message_error", {
          message: "Message contains prohibited content",
          violations: safetyAnalysis.violations,
        });
        return;
      }

      // Send message using service
      const result = await messageService.sendMessage(
        socket.user.id,
        receiverId,
        content
      );

      // Update message status to 'delivered' if receiver is online
      const onlineHandler = require("./onlineHandler");
      if (onlineHandler.isUserOnline(receiverId)) {
        try {
          const Message = require("../models/Message");
          await Message.findByIdAndUpdate(result.message.id, {
            messageStatus: "delivered",
          });

          // Update the result object to reflect the status change
          result.message.messageStatus = "delivered";
        } catch (error) {
          logger.error("Error updating message status to delivered:", error);
        }
      }

      // Stop typing indicator
      this.stopTyping(socket, receiverId, io);

      // Emit to sender
      socket.emit("message_sent", {
        message: result.message,
        conversation: result.conversation,
      });

      // Emit to receiver if online
      const receiverRoom = `user_${receiverId}`;
      io.to(receiverRoom).emit("new_message", {
        message: result.message,
        conversation: {
          conversationId: result.conversation.conversationId,
          otherUser: {
            id: socket.user.id,
            username: socket.user.username,
            role: socket.user.role,
          },
        },
      });

      // Emit to conversation room if both users are in it
      const conversationId = Message.createConversationId(
        socket.user.id,
        receiverId
      );
      const roomName = `conversation_${conversationId}`;
      io.to(roomName).emit("conversation_message", result.message);

      logger.info(
        `Real-time message sent from ${socket.user.id} to ${receiverId}`
      );
    } catch (error) {
      logger.error(`Error handling send message: ${error.message}`);
      socket.emit("message_error", { message: "Failed to send message" });
    }
  }

  // Handle marking messages as read
  async handleMarkAsRead(socket, io, data) {
    try {
      const { otherUserId } = data;

      if (!otherUserId || otherUserId === socket.user.id) {
        socket.emit("message_error", { message: "Invalid user ID" });
        return;
      }

      const conversationId = Message.createConversationId(
        socket.user.id,
        otherUserId
      );

      // Update messages with both read status and message status
      const Message = require("../models/Message");
      await Message.updateMany(
        {
          conversationId,
          receiver: socket.user.id,
          read: false,
        },
        {
          read: true,
          readAt: new Date(),
          messageStatus: "read",
        }
      );

      // Mark messages as read
      // await messageService.markMessagesAsRead(socket.user.id, otherUserId);

      // Notify sender that messages were read
      const senderRoom = `user_${otherUserId}`;
      io.to(senderRoom).emit("messages_read", {
        readByUserId: socket.user.id,
        readByUsername: socket.user.username,
        conversationId: Message.createConversationId(
          socket.user.id,
          otherUserId
        ),
      });

      socket.emit("messages_marked_read", {
        otherUserId,
        timestamp: new Date(),
      });

      logger.debug(
        `Messages marked as read by ${socket.user.id} in conversation with ${otherUserId}`
      );
    } catch (error) {
      logger.error(`Error marking messages as read: ${error.message}`);
      socket.emit("error", { message: "Failed to mark messages as read" });
    }
  }

  // Handle user blocking
  async handleBlockUser(socket, io, data) {
    try {
      const { targetUserId } = data;

      if (!targetUserId || targetUserId === socket.user.id) {
        socket.emit("error", { message: "Invalid target user ID" });
        return;
      }

      // Block/unblock user using service
      const result = await messageService.toggleBlockUser(
        socket.user.id,
        targetUserId
      );

      // Notify the user who performed the action
      socket.emit("user_block_toggled", {
        targetUserId,
        action: result.action,
        blockedUsers: result.blockedUsers,
      });

      // If blocked, close any active conversation
      if (result.action === "blocked") {
        const conversationId = Message.createConversationId(
          socket.user.id,
          targetUserId
        );
        const roomName = `conversation_${conversationId}`;

        // Leave conversation room
        socket.leave(roomName);

        // Notify the blocked user if online
        const blockedUserRoom = `user_${targetUserId}`;
        io.to(blockedUserRoom).emit("conversation_blocked", {
          blockedByUserId: socket.user.id,
          conversationId,
        });
      }

      logger.info(
        `User ${socket.user.id} ${result.action} user ${targetUserId}`
      );
    } catch (error) {
      logger.error(`Error handling block user: ${error.message}`);
      socket.emit("error", { message: "Failed to block/unblock user" });
    }
  }

  // Clean up user rooms on disconnect
  cleanupUserRooms(socket) {
    try {
      const userId = socket.user.id;

      // Clear any active typing indicators
      for (const [key, timeout] of this.activeTyping.entries()) {
        if (key.startsWith(`${userId}_`)) {
          clearTimeout(timeout);
          this.activeTyping.delete(key);
        }
      }

      // Remove user from room tracking
      if (this.userRooms.has(userId)) {
        this.userRooms.delete(userId);
      }

      logger.debug(`Cleaned up rooms for user ${userId}`);
    } catch (error) {
      logger.error(`Error cleaning up user rooms: ${error.message}`);
    }
  }

  // Get conversation statistics for admin
  async getConversationStats() {
    try {
      const totalMessages = await Message.countDocuments({
        deleted: { $ne: true },
      });
      const totalConversations = (await Message.distinct("conversationId"))
        .length;
      const activeUsers = this.userRooms.size;
      const activeTyping = this.activeTyping.size;

      return {
        totalMessages,
        totalConversations,
        activeUsers,
        activeTyping,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Error getting conversation stats: ${error.message}`);
      return null;
    }
  }
}

module.exports = new ChatHandler();
