const express = require('express')
const {
  createOneToOneConversation,
  createGroupConversation,
  getConversationById,
  getConversationsForUser,
  inviteMember,
  approveMember,
  rejectMember,
  removeMember,
  updateMemberRole,
  deleteConversation,
  leaveGroup,
  searchOneToOneConversation,
  getParticipantsForConversation,
  updateGroupConversation
} = require('../controllers/conversationController')
const { getMessagesForConversation, sendMessage, getMessageById, getMediaMessagesForConversation } = require('../controllers/messageController')
const upload = require('../utils/uploadMemory')

const router = express.Router()

/**
 * @route   GET /api/conversations/one-to-one/search
 * @desc    Search for a ONE-TO-ONE conversation with a target user
 * @access  Authenticated user
 * @query   { targetUser: string }
 * @returns { conversation: object }
 */
router.get('/one-to-one/search', searchOneToOneConversation)

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
 * @route   POST /api/conversations/group
 * @desc    Create a GROUP conversation with an initial message and optional group image
 * @access  Authenticated user
 * @body    { participantIds: string[], groupName?: string }
 * @form    groupImage: file (optional, image file)
 * @returns {
 *   message: string,
 *   conversation: object,
 *   participants: participantItem[],
 *   initialMessage: object
 * }
 */
router.post(
  '/group',
  upload.single('groupImage'), // Accept a single file named 'groupImage'
  createGroupConversation
)

/**
 * @route   GET /api/conversations/
 * @desc    Get all conversations for a specific user (chronological order and pagination)
 * @access  Authenticated user
 * @returns { conversations: Array | [] }
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

/**
 * @route   GET /api/conversations/:conversationId/media
 * @desc    Get only media messages (type: MEDIA) for a specific conversation, with pagination (latest to oldest).
 *          Each media message will only include the content field (media URL) unless more fields are needed.
 * @access  Authenticated user
 * @params  { conversationId: string }
 * @query   { limit?: number, lastMessageId?: string }
 * @returns {
 *   messages: Array<{ content: string }>,
 *   lastMessageId: string | null
 * }
 */
router.get('/:conversationId/media', getMediaMessagesForConversation)

/**
 * @route   POST /api/conversations/:conversationId/invite
 * @desc    Invite a user to a group conversation
 * @access  Authenticated user
 * @params  { conversationId: string }
 * @body    { invitedUserId: string }
 * @returns {
 *   message: string,
 *   pendingParticipantIds?: string[] // If the inviter is not an admin, the user is added to the pending list
 * }
 */
router.post('/:conversationId/invite', inviteMember)

/**
 * @route   POST /api/conversations/:conversationId/approve
 * @desc    Approve a pending invitation to a group conversation
 * @access  Authenticated user (Admin or Creator)
 * @params  { conversationId: string }
 * @body    { approvedUserId: string }
 * @returns { message: string }
 */
router.post('/:conversationId/approve', approveMember)

/**
 * @route   POST /api/conversations/:conversationId/reject
 * @desc    Reject a pending invitation to a group conversation
 * @access  Authenticated user (Admin or Creator)
 * @params  { conversationId: string }
 * @body    { rejectedUserId: string }
 * @returns { message: string }
 */
router.post('/:conversationId/reject', rejectMember)

/**
 * @route   DELETE /api/conversations/:conversationId/members/:userId
 * @desc    Remove a user from a group conversation
 * @access  Authenticated user (Admin or Creator)
 * @params  { conversationId: string, userId: string }
 * @returns { message: string }
 */
router.delete('/:conversationId/members/:userId', removeMember)

/**
 * @route   PATCH /api/conversations/:conversationId/members/:userId/role
 * @desc    Promote or demote a user to/from admin in a group conversation
 * @access  Authenticated user (Creator only)
 * @params  { conversationId: string, userId: string }
 * @body    { isAdmin: boolean }
 * @returns { message: string }
 */
router.patch('/:conversationId/members/:userId/role', updateMemberRole)

/**
 * @route   DELETE /api/conversations/:conversationId
 * @desc    Delete a conversation (only for the creator)
 * @access  Authenticated user (Creator only)
 * @params  { conversationId: string }
 * @returns { message: string }
 */
router.delete('/:conversationId', deleteConversation)

/**
 * @route   DELETE /api/conversations/:conversationId/leave
 * @desc    Leave a group conversation
 * @access  Authenticated user
 * @params  { conversationId: string }
 * @body    { newAdmins?: string[] } // Required if the creator is leaving and there are no admins
 * @returns { message: string }
 */
router.delete('/:conversationId/leave', leaveGroup)

/**
 * @route   GET /api/conversations/:conversationId/participants
 * @desc    Get all participants of a conversation
 * @access  Authenticated user
 */
router.get('/:conversationId/participants', getParticipantsForConversation)

/**
 * @route   PATCH /api/conversations/:conversationId
 * @desc    Update groupName and/or groupImage for a group conversation
 * @access  Authenticated user (admin or creator)
 * @params  { conversationId: string }
 * @body    { groupName?: string }
 * @form    groupImage: file (optional, image file)
 */
router.patch('/:conversationId', upload.single('groupImage'), updateGroupConversation)

module.exports = router
