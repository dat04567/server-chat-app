const express = require('express');
const {
  createOneToOneConversation,
  createGroupConversation,
  getConversationById,
  getConversationsForUser,
  sendMessage
} = require('../controllers/conversationController');

const router = express.Router();

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
 *   message: {
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
 */
router.post('/one-to-one', createOneToOneConversation);

/**
 * @route   POST /conversations/group
 * @desc    Create a GROUP conversation
 * @access  Public
 * @body    { creatorId: string, groupName: string, groupImage?: string, participantIds: string[] }
 * @returns {
 *   conversationId: string,
 *   type: string,
 *   groupName: string,
 *   groupImage: string,
 *   creatorId: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   isDeleted: boolean
 * }
 */
router.post('/group', createGroupConversation);

/**
 * @route   POST /conversations/:conversationId/messages
 * @desc    Send a message to a conversation
 * @access  Public
 * @body    { senderId: string, content: string, type?: string }
 * @returns {
 *   conversationId: string,
 *   messageId: string,
 *   senderId: string,
 *   type: string,
 *   content: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   status: string
 * }
 */
router.post('/:conversationId/messages', sendMessage);

/**
 * @route   GET /conversations/:conversationId
 * @desc    Get a specific conversation by its ID
 * @access  Public
 * @params  { conversationId: string }
 * @returns {
 *   conversation: conversationItem,
 *   participants: participantItem[],
 *   messages: messageItem[]
 * }
 */
router.get('/:conversationId', getConversationById);

/**
 * @route   GET /conversations/user/:userId
 * @desc    Get all conversations for a specific user (chronological order and pagination)
 * @access  Public
 * @params  { userId: string }
 * @query   { limit?: number, lastEvaluatedKey?: string }
 * @returns { conversations: Array | [], lastEvaluatedKey: string | null }
 */
router.get('/user/:userId', getConversationsForUser);

module.exports = router;
