const User = require("../models/User");
const logger = require("../utils/logger");

class OnlineHandler {
  constructor() {
    this.onlineUsers = new Map(); // Store online user sessions
    this.userSockets = new Map(); // Map user IDs to socket IDs
  }

  // Handle user connection
  async userConnected(socket, io) {
    try {
      const userId = socket.user.id;
      const username = socket.user.username;

      // Add to online users tracking
      this.onlineUsers.set(userId, {
        userId,
        username,
        role: socket.user.role,
        socketId: socket.id,
        connectedAt: new Date(),
        lastActivity: new Date(),
      });

      // Map socket to user
      this.userSockets.set(socket.id, userId);

      // Update user's online status in database
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastSeen: new Date(),
      });

      // Notify relevant users about online status
      await this.broadcastUserStatus(userId, true, io);

      // Set up activity tracking
      this.setupActivityTracking(socket);

      logger.info(`User ${username} (${userId}) is now online`);
    } catch (error) {
      logger.error(`Error handling user connection: ${error.message}`);
    }
  }

  // Handle user disconnection
  async userDisconnected(socket, io) {
    try {
      const userId = socket.user.id;
      const username = socket.user.username;

      // Remove from online tracking
      this.onlineUsers.delete(userId);
      this.userSockets.delete(socket.id);

      // Update user's offline status in database
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date(),
      });

      // Notify relevant users about offline status
      await this.broadcastUserStatus(userId, false, io);

      logger.info(`User ${username} (${userId}) is now offline`);
    } catch (error) {
      logger.error(`Error handling user disconnection: ${error.message}`);
    }
  }

  // Set up activity tracking for the socket
  setupActivityTracking(socket) {
    // Update last activity on any socket event
    const originalEmit = socket.emit;
    socket.emit = function (...args) {
      const userId = socket.user?.id;
      if (userId && this.onlineUsers.has(userId)) {
        const userInfo = this.onlineUsers.get(userId);
        userInfo.lastActivity = new Date();
        this.onlineUsers.set(userId, userInfo);
      }
      return originalEmit.apply(socket, args);
    }.bind(this);

    // Listen for activity events
    socket.on("user_activity", () => {
      this.updateUserActivity(socket.user.id);
    });
  }

  // Update user activity timestamp
  updateUserActivity(userId) {
    if (this.onlineUsers.has(userId)) {
      const userInfo = this.onlineUsers.get(userId);
      userInfo.lastActivity = new Date();
      this.onlineUsers.set(userId, userInfo);
    }
  }

  // Broadcast user status to relevant users
  async broadcastUserStatus(userId, isOnline, io) {
    try {
      // Get user info
      const user = await User.findById(userId).select("username role");
      if (!user) return;

      // Find users who have conversations with this user
      const Message = require("../models/Message");
      const conversationPartners = await Message.distinct("sender", {
        receiver: userId,
      });
      const conversationPartners2 = await Message.distinct("receiver", {
        sender: userId,
      });

      // Combine and deduplicate
      const allPartners = [
        ...new Set([...conversationPartners, ...conversationPartners2]),
      ];

      // Broadcast to each conversation partner
      allPartners.forEach((partnerId) => {
        if (partnerId.toString() !== userId) {
          const partnerRoom = `user_${partnerId}`;
          io.to(partnerRoom).emit("user_status_change", {
            userId,
            username: user.username,
            role: user.role,
            isOnline,
            timestamp: new Date(),
          });
        }
      });
    } catch (error) {
      logger.error(`Error broadcasting user status: ${error.message}`);
    }
  }

  // Get online status for a specific user
  isUserOnline(userId) {
    return this.onlineUsers.has(userId);
  }

  // Get online user info
  getOnlineUserInfo(userId) {
    return this.onlineUsers.get(userId) || null;
  }

  // Get all online users (for admin)
  getAllOnlineUsers() {
    return Array.from(this.onlineUsers.values());
  }

  // Get online users count
  getOnlineUsersCount() {
    return this.onlineUsers.size;
  }

  // Get online users by role
  getOnlineUsersByRole(role) {
    return Array.from(this.onlineUsers.values()).filter(
      (user) => user.role === role
    );
  }

  // Check if two users are both online
  areUsersOnline(userId1, userId2) {
    return this.isUserOnline(userId1) && this.isUserOnline(userId2);
  }

  // Get user's socket ID
  getUserSocketId(userId) {
    const userInfo = this.onlineUsers.get(userId);
    return userInfo ? userInfo.socketId : null;
  }

  // Send direct message to user if online
  sendToUser(userId, event, data, io) {
    try {
      if (this.isUserOnline(userId)) {
        const userRoom = `user_${userId}`;
        io.to(userRoom).emit(event, data);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Error sending message to user ${userId}: ${error.message}`);
      return false;
    }
  }

  // Cleanup inactive users (run periodically)
  cleanupInactiveUsers() {
    const now = new Date();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [userId, userInfo] of this.onlineUsers.entries()) {
      const lastActivity = new Date(userInfo.lastActivity);
      if (now - lastActivity > inactiveThreshold) {
        logger.info(`Marking user ${userId} as inactive due to inactivity`);
        this.onlineUsers.delete(userId);

        // Update database
        User.findByIdAndUpdate(userId, {
          isOnline: false,
          lastSeen: lastActivity,
        }).catch((error) => {
          logger.error(`Error updating inactive user status: ${error.message}`);
        });
      }
    }
  }

  // Get online status statistics
  getOnlineStats() {
    const stats = {
      totalOnline: this.onlineUsers.size,
      artists: 0,
      buyers: 0,
      admins: 0,
      usersByRole: {},
    };

    for (const userInfo of this.onlineUsers.values()) {
      if (userInfo.role === "artist") stats.artists++;
      else if (userInfo.role === "buyer") stats.buyers++;
      else if (userInfo.role === "admin") stats.admins++;

      if (!stats.usersByRole[userInfo.role]) {
        stats.usersByRole[userInfo.role] = 0;
      }
      stats.usersByRole[userInfo.role]++;
    }

    return stats;
  }

  // Broadcast to all online users
  broadcastToAll(event, data, io) {
    try {
      io.emit(event, data);
      logger.debug(`Broadcasted ${event} to all online users`);
    } catch (error) {
      logger.error(`Error broadcasting to all users: ${error.message}`);
    }
  }

  // Broadcast to users by role
  broadcastToRole(role, event, data, io) {
    try {
      const users = this.getOnlineUsersByRole(role);
      users.forEach((user) => {
        const userRoom = `user_${user.userId}`;
        io.to(userRoom).emit(event, data);
      });
      logger.debug(`Broadcasted ${event} to ${users.length} ${role}s`);
    } catch (error) {
      logger.error(`Error broadcasting to ${role}s: ${error.message}`);
    }
  }

  // Initialize cleanup interval
  startCleanupInterval() {
    // Clean up inactive users every 5 minutes
    setInterval(() => {
      this.cleanupInactiveUsers();
    }, 5 * 60 * 1000);

    logger.info("Online status cleanup interval started");
  }

  // Force disconnect a user (admin function)
  async forceDisconnectUser(userId, io, reason = "Forced disconnect") {
    try {
      if (this.isUserOnline(userId)) {
        const userRoom = `user_${userId}`;
        io.to(userRoom).emit("force_disconnect", {
          reason,
          timestamp: new Date(),
        });

        // Remove from tracking
        this.onlineUsers.delete(userId);

        // Update database
        await User.findByIdAndUpdate(userId, {
          isOnline: false,
          lastSeen: new Date(),
        });

        logger.info(`Force disconnected user ${userId}: ${reason}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Error force disconnecting user: ${error.message}`);
      return false;
    }
  }

  // Get user's online duration
  getUserOnlineDuration(userId) {
    const userInfo = this.onlineUsers.get(userId);
    if (!userInfo) return 0;

    const now = new Date();
    const connectedAt = new Date(userInfo.connectedAt);
    return now - connectedAt;
  }

  // Check if user has been active recently (within last 5 minutes)
  isUserActive(userId) {
    const userInfo = this.onlineUsers.get(userId);
    if (!userInfo) return false;

    const now = new Date();
    const lastActivity = new Date(userInfo.lastActivity);
    const activeThreshold = 5 * 60 * 1000; // 5 minutes

    return now - lastActivity < activeThreshold;
  }
}

module.exports = new OnlineHandler();
