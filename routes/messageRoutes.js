const express = require('express')
const {
  sendMessage,
  getMessagesForConversation,
  getMessageById,
} = require('../controllers/messageController')

const router = express.Router()

/**
 * @route   POST conversations/:conversationId/messages
 * @desc    Send a new message to a specific conversation
 * @access  Public
 * @params  { conversationId: string }
 * @body    { senderId: string, recipientId: string (optional), content: string }
 * @returns { messageItem }
 */
router.post('/conversations/:conversationId/messages', sendMessage)

/**
 * @route   GET /conversations/:conversationId/messages
 * @desc    Get all messages in a specific conversation (paginated)
 * @access  Public
 * @params  { conversationId: string }
 * @query   { limit: number (optional), lastEvaluatedMessageId: string (optional) }
 * @returns { messages: Array, lastEvaluatedKey: string (optional) }
 */
router.get(
  'messsages/conversations/:conversationId/messages',
  getMessagesForConversation
)

/**
 * @route   GET /conversations/:conversationId/messages/:messageId
 * @desc    Get a specific message in a conversation
 * @access  Public
 * @params  { conversationId: string, messageId: string }
 * @returns {messageItem }
 */
router.get('/conversations/:conversationId/messages/:messageId', getMessageById)

module.exports = router
