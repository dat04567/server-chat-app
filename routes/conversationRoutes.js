const express = require('express')
const {
  createOneToOneConversation,
  getConversationById,
  getConversationsForUser,
} = require('../controllers/conversationController')

const router = express.Router()

/**
 * @route   POST /conversations/one-to-one
 * @desc    Create a ONE-TO-ONE conversation between two users with an initial message
 * @access  Public
 * @body    { senderId: string, recipientId: string, content: string }
 * @returns {
 *   conversation: {
 *     conversationId: string,
 *     type: string,
 *     participantPairKey: string,
 *     lastMessageText: string,
 *     lastMessageAt: string,
 *     createdAt: string,
 *     updatedAt: string,
 *     isDeleted: boolean
 *   },
 *   initialMessage: {
 *     conversationId: string,
 *     messageId: string,
 *     senderId: string,
 *     recipientId: string,
 *     type: string,
 *     content: string,
 *     createdAt: string,
 *     updatedAt: string
 *   }
 * }
 *
 * @returns {conversation} if the conversation already exists, it returns the existing conversation
 */
router.post('/one-to-one', createOneToOneConversation)

/**
 * @route   GET /conversations/:conversationId
 * @desc    Get a specific conversation by its ID
 * @access  Public
 * @params  { conversationId: string }
 * @returns { conversationItem }
 */
router.get('/:conversationId', getConversationById)

/**
 * @route   GET /users/:userId/conversations
 * @desc    Get all conversations for a specific user (chronological order and pagination)
 * @access  Public
 * @params  { userId: string }
 * @query   { limit?: number, pageToken?: string }
 * @returns { conversations: Array | [], lastEvaluatedKey: string | null }
 */
router.get('/users/:userId/conversations', getConversationsForUser)

module.exports = router
