const express = require('express')
const router = express.Router()
const friendshipController = require('../controllers/friendshipController')
const { authMiddleware } = require('../middleware/authMiddleware')

/**
 * @route   POST /api/friendships/request
 * @desc    Send a friend request to another user
 * @access  Authenticated user
 * @body    { friendId: string }
 * @returns { message: string, friendship: Object }
 */
router.post('/request', friendshipController.sendFriendRequest)

/**
 * @route   DELETE /api/friendships/:friendId/cancel
 * @desc    Cancel a sent friend request
 * @access  Authenticated user
 * @params  { friendId: string }
 * @returns { message: string }
 */
router.delete('/:friendId/cancel', friendshipController.cancelFriendRequest)

/**
 * @route   PUT /api/friendships/:friendId/accept
 * @desc    Accept a received friend request
 * @access  Authenticated user
 * @params  { friendId: string }
 * @returns { message: string, friendship: Object }
 */
router.put('/:friendId/accept', friendshipController.acceptFriendRequest)

/**
 * @route   DELETE /api/friendships/:friendId/reject
 * @desc    Reject a received friend request
 * @access  Authenticated user
 * @params  { friendId: string }
 * @returns { message: string }
 */
router.delete('/:friendId/reject', friendshipController.rejectFriendRequest)

/**
 * @route   DELETE /api/friendships/:friendId/unfriend
 * @desc    Unfriend an existing friend
 * @access  Authenticated user
 * @params  { friendId: string }
 * @returns { message: string }
 */
router.delete('/:friendId/unfriend', friendshipController.unfriend)

/**
 * @route   GET /api/friendships
 * @desc    List all friends of the authenticated user
 * @access  Authenticated user
 * @returns { friends: Array<{ userId: string, profile: Object }> }
 */
router.get('/', friendshipController.listFriends)

/**
 * @route   GET /api/friendships/received
 * @desc    List all received friend requests
 * @access  Authenticated user
 * @returns { requests: Array<{ userId: string, profile: Object }> }
 */
router.get('/received', friendshipController.listReceivedRequests)

/**
 * @route   GET /api/friendships/sent
 * @desc    List all sent friend requests
 * @access  Authenticated user
 * @returns { requests: Array<{ userId: string, profile: Object }> }
 */
router.get('/sent', friendshipController.listSentRequests)

/**
 * @route   GET /api/friendships/:friendId/status
 * @desc    Get the relationship status (PENDING or ACCEPTED) and whether the authenticated user is the initiator
 * @access  Authenticated user
 * @params  { friendId: string }
 * @returns { status: 'PENDING' | 'ACCEPTED', isInitiator: boolean }
 */
router.get('/:friendId/status', friendshipController.checkFriendStatus)

module.exports = router
