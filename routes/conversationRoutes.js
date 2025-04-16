const express = require('express');
const {
  createOneToOneConversation,
  createGroupConversation,
  getConversationById,
  getConversationsForUser,
  sendMessage
} = require('../controllers/conversationController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   POST /conversations/one-to-one
 * @desc    Create a ONE-TO-ONE conversation between two users with an initial message
 * @access  Private
 * @body    { recipientId: string, content: string }
 */
router.post('/one-to-one', authMiddleware, createOneToOneConversation);

/**
 * @route   POST /conversations/group
 * @desc    Create a GROUP conversation
 * @access  Private
 * @body    { groupName: string, groupImage?: string, participantIds: string[] }
 */
router.post('/group', authMiddleware, createGroupConversation);

/**
 * @route   POST /conversations/:conversationId/messages
 * @desc    Send a message to a conversation
 * @access  Private
 * @body    { content: string, type?: string }
 */
router.post('/:conversationId/messages', authMiddleware, sendMessage);

/**
 * @route   GET /conversations/:conversationId
 * @desc    Get a specific conversation by its ID
 * @access  Private
 * @params  { conversationId: string }
 */
router.get('/:conversationId', authMiddleware, getConversationById);

/**
 * @route   GET /conversations
 * @desc    Get all conversations for the logged-in user (chronological order and pagination)
 * @access  Private
 * @query   { limit?: number, lastEvaluatedKey?: string }
 * @returns { conversations: Array | [], lastEvaluatedKey: string | null }
 */
router.get('/', authMiddleware, getConversationsForUser);

module.exports = router;
