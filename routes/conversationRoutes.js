const express = require('express')
const {
  createOneToOneConversation,
  createGroupConversation,
  getConversationById,
  getConversationsForUser
} = require('../controllers/conversationController')
const {
  getMessagesForConversation,
  sendMessage,
  getMessageById
} = require('../controllers/messageController')

const router = express.Router()

/**
 * @route   POST /api/conversations/one-to-one
 * @desc    Create a ONE-TO-ONE conversation between two users with an initial message
 * @access  Authenticated user
 * @body    { recipientId: string, content: string }
 * @returns { message : string, conversation : object, initialMessage : object }
 * @returns { message : string, conversation : object} if the conversation already exists, it returns the existing conversation
 */
router.post('/one-to-one', createOneToOneConversation)

/**
 * @route   GET /api/conversations/
 * @desc    Get all conversations for a specific user (chronological order and pagination)
 * @access  Authenticated user
 * @query   { limit?: number, lastEvaluatedKey?: string }
 * @returns { conversations: Array | [], lastEvaluatedKey: string | null }
 */
router.get('/', getConversationsForUser)

/**
 * @route   GET /api/conversations/:conversationId
 * @desc    Get a specific conversation by its ID
 * @access  Authenticated user
 * @params  { conversationId: string }
 * @returns {
 *   conversation: conversation: object,
 *   participants: participantItem[],
 *   messages: messageItem[]
 * }
 */
router.get('/:conversationId', getConversationById)

/**
 * @route   GET /api/conversations/:conversationId/messages
 * @desc    Get messages for a specific conversation with pagination (latest to oldest)
 * @access  Authenticated user
 * @params  { conversationId: string }
 * @query   { limit?: number, lastMessageId?: string }
 * @returns { messages: Array | [], lastEvaluatedKey: string | null }
 */
router.get('/:conversationId/messages', getMessagesForConversation)

/**
 * @route   POST /api/conversations/:conversationId/messages
 * @desc    Send a new message to a specific conversation
 * @access  Authenticated user
 * @params  { conversationId: string }
 * @body    { content: string }
 * @returns { message: string, savedMessage: object }
 */
router.post('/:conversationId/messages', sendMessage)

/**
 * @route   GET /api/conversations/:conversationId/messages/:messageId
 * @desc    Get a specific message in a conversation
 * @access  Public
 * @params  { userId: string }
 * @query   { limit?: number, lastEvaluatedKey?: string }
 * @returns { conversations: Array | [], lastEvaluatedKey: string | null }
 * @params  { conversationId: string, messageId: string }
 * @returns { message: object }
 */
router.get('/:conversationId/messages/:messageId', getMessageById)

module.exports = router
