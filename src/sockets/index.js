const logger = require("../utils/logger");
const { verifyToken } = require("../utils/helpers");
const User = require("../models/User");
const chatHandler = require("./chatHandler");
const onlineHandler = require("./onlineHandler");

module.exports = (io) => {
  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(" ")[1];

      if (!token) {
        logger.error("Socket authentication failed: No token provided");
        return next(new Error("Authentication error: No token provided"));
      }

      // Verify the token
      const decoded = await verifyToken(token);
      if (!decoded) {
        logger.error("Socket authentication failed: Invalid token");
        return next(new Error("Authentication error: Invalid token"));
      }

      // Get user from the database
      const user = await User.findById(decoded.id).select("+password");
      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      if (!user.isVerified) {
        return next(new Error("Authentication error: User not verified"));
      }

      // Attach user to socket
      socket.user = {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        email: user.email,
      };

      next();
    } catch (error) {
      logger.error(`Socket authentication error: ${error.message}`);
      return next(new Error("Authentication error"));
    }
  });

  // Handle socket connections
  io.on("connection", (socket) => {
    logger.info(`User connected: ${socket.user.username} (${socket.user.id})`);

    // Join user-specific room
    const userRoom = `user_${socket.user.id}`;
    socket.join(userRoom);

    // Update user online status
    onlineHandler.userConnected(socket, io);

    // Set up chat event handlers
    chatHandler.setupChatHandlers(socket, io);

    // Handle user joining specific conversation rooms
    socket.on("join_conversation", (data) => {
      chatHandler.joinConversation(socket, data);
    });

    // Handle user leaving conversation rooms
    socket.on("leave_conversation", (data) => {
      chatHandler.leaveConversation(socket, data);
    });

    // Handle typing indicators
    socket.on("typing_start", (data) => {
      chatHandler.handleTypingStart(socket, io, data);
    });

    socket.on("typing_stop", (data) => {
      chatHandler.handleTypingStop(socket, io, data);
    });

    // Handle message sending
    socket.on("send_message", (data) => {
      chatHandler.handleSendMessage(socket, io, data);
    });

    // Handle message read status
    socket.on("mark_as_read", (data) => {
      chatHandler.handleMarkAsRead(socket, io, data);
    });

    // Handle user blocking
    socket.on("block_user", (data) => {
      chatHandler.handleBlockUser(socket, io, data);
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      logger.info(
        `User disconnected: ${socket.user.username} (${socket.user.id}) - Reason: ${reason}`
      );

      // Update user offline status
      // Update user offline status
      onlineHandler.userDisconnected(socket, io);

      // Clean up any conversation rooms
      chatHandler.cleanupUserRooms(socket);
    });

    // Handle connection errors
    socket.on("error", (error) => {
      logger.error(`Socket error for user ${socket.user.id}: ${error.message}`);
    });

    socket.emit("connected", {
      message: "Successfully connected to messaging service",
      userId: socket.user.id,
      timestamp: new Date(),
    });
  });

  //  Global error handler
  io.on("connect_error", (error) => {
    logger.error(`Socket.io connection error: ${error.message}`);
  });

  logger.info("Socket.io messaging system initialized");
};
