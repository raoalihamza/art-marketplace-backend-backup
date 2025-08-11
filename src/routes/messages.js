const express = require("express");
const messageController = require("../controllers/messageController");
const { protect } = require("../middleware/auth");
const {
  validateSendMessage,
  validateGetConversation,
  validateMarkAsRead,
  validateDeleteMessage,
  validateBlockUser,
  validateSearchConversations,
  validateSearchWithinConversation,
} = require("../validators/messageValidator");

const router = express.Router();

// All message routes require authentication
router.use(protect);

// Send a new message
router.post("/send", validateSendMessage, messageController.sendMessage);

// Get user's conversations list
router.get("/conversations", messageController.getConversations);

// Search conversations
router.get(
  "/conversations/search",
  validateSearchConversations,
  messageController.searchConversations
);

// Get messages in a specific conversation
router.get(
  "/conversation/:userId",
  validateGetConversation,
  messageController.getConversationMessages
);

// Mark messages as read in a conversation
router.put(
  "/conversation/:userId/read",
  validateMarkAsRead,
  messageController.markMessagesAsRead
);

// Delete a message
router.delete(
  "/:messageId",
  validateDeleteMessage,
  messageController.deleteMessage
);

// Block/Unblock a user
router.put(
  "/block/:userId",
  validateBlockUser,
  messageController.toggleBlockUser
);

// Get unread message count
router.get("/unread-count", messageController.getUnreadCount);

router.get(
  "/conversation/:userId/search",
  validateSearchWithinConversation,
  messageController.searchWithinConversation
);

module.exports = router;
