const express = require('express');
const {
  sendMessage,
  getMessagesForConversation,
  getMessageById,
} = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   POST conversations/:conversationId/messages
 * @desc    Send a new message to a specific conversation
 * @access  Private
 * @params  { conversationId: string }
 * @body    { senderId: string, recipientId: string (optional), content: string }
 * @returns { messageItem }
 */
router.post('/conversations/:conversationId/messages', authMiddleware, sendMessage);

/**
 * @route   GET /conversations/:conversationId/messages
 * @desc    Get all messages in a specific conversation (paginated)
 * @access  Private
 * @params  { conversationId: string }
 * @query   { limit: number (optional), lastEvaluatedMessageId: string (optional) }
 * @returns { messages: Array, lastEvaluatedKey: string (optional) }
 */
router.get(
  '/conversations/:conversationId/messages',
  authMiddleware,
  getMessagesForConversation
);

/**
 * @route   GET /conversations/:conversationId/messages/:messageId
 * @desc    Get a specific message in a conversation
 * @access  Private
 * @params  { conversationId: string, messageId: string }
 * @returns {messageItem }
 */
router.get('/conversations/:conversationId/messages/:messageId', authMiddleware, getMessageById);

module.exports = router;
