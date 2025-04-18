const express = require('express')
const router = express.Router()
const friendshipController = require('../controllers/friendshipController')
const { authMiddleware } = require('../middleware/authMiddleware')

/**
 * @route   POST /api/friendships/request
 * @desc    Send a friend request to another user
 * @access  Authenticated user
 * @body    { recipientId: string }
 * @returns { message: string, friendship: Object }
 */
router.post('/request', authMiddleware, friendshipController.sendFriendRequest)

/**
 * @route   DELETE /api/friendships/:friendId/cancel
 * @desc    Cancel a sent friend request
 * @access  Authenticated user
 * @params  { friendId: string }
 * @returns { message: string }
 */
router.delete(
  '/:friendId/cancel',
  authMiddleware,
  friendshipController.deleteFriendship
)

/**
 * @route   PUT /api/friendships/:friendId/accept
 * @desc    Accept a received friend request
 * @access  Authenticated user
 * @params  { friendId: string }
 * @returns { message: string, friendship: Object }
 */
router.put(
  '/:friendId/accept',
  authMiddleware,
  friendshipController.acceptFriendRequest
)

/**
 * @route   DELETE /api/friendships/:friendId/reject
 * @desc    Reject a received friend request
 * @access  Authenticated user
 * @params  { friendId: string }
 * @returns { message: string }
 */
router.delete(
  '/:friendId/reject',
  authMiddleware,
  friendshipController.deleteFriendship
)

/**
 * @route   DELETE /api/friendships/:friendId/unfriend
 * @desc    Remove an existing friend
 * @access  Authenticated user
 * @params  { friendId: string }
 * @returns { message: string }
 */
router.delete(
  '/:friendId/unfriend',
  authMiddleware,
  friendshipController.deleteFriendship
)

/**
 * @route   GET /api/friendships
 * @desc    List all friends of the authenticated user
 * @access  Authenticated user
 * @returns { friends: Array | [] }
 */
router.get('/', authMiddleware, friendshipController.listFriends)

/**
 * @route   GET /api/friendships/received
 * @desc    List all received friend requests
 * @access  Authenticated user
 * @returns { receivedRequests: Array | [] }
 */
router.get(
  '/received',
  authMiddleware,
  friendshipController.listReceivedRequests
)

/**
 * @route   GET /api/friendships/sent
 * @desc    List all sent friend requests
 * @access  Authenticated user
 * @returns { sentRequests: Array | [] }
 */
router.get('/sent', authMiddleware, friendshipController.listSentRequests)

module.exports = router
