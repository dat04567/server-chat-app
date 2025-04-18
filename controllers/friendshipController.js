const Friendship = require('../models/friendshipModel')
const User = require('../models/userModel')
const { handleError } = require('../utils')

// Send a friend request
exports.sendFriendRequest = async (req, res) => {
  try {
    const { friendId } = req.body
    const userId = req.user.id

    if (userId === friendId) {
      return res
        .status(400)
        .json({ error: 'You cannot send a friend request to yourself.' })
    }

    // Check if there's a friendId
    if (!friendId) {
      return res
        .status(400)
        .json({ error: 'friendId is required to send a friend request' })
    }

    // Check if the friend exists
    const friend = await User.get(friendId)
    if (!friend) {
      return res.status(404).json({ error: 'User not found.' })
    }

    // Check if a friendship already exists
    const existingFriendship = await Friendship.get({ userId, friendId })
    if (existingFriendship) {
      return res.status(400).json({ error: 'Friendship already exists.' })
    }

    // Create bi-directional friendship entries
    const friendship1 = new Friendship({
      userId,
      friendId,
      initiatorId: userId,
      status: 'PENDING'
    })

    const friendship2 = new Friendship({
      userId: friendId,
      friendId: userId,
      initiatorId: userId,
      status: 'PENDING'
    })

    // Perform batch write
    await Friendship.batchPut([friendship1, friendship2])

    res.status(201).json({
      message: 'Friend request sent successfully.',
      friendship: friendship1
    })
  } catch (error) {
    handleError(error, req, res)
  }
}

// Accept a friend request
exports.acceptFriendRequest = async (req, res) => {
  try {
    const userId = req.user.id // Extracted from JWT middleware
    const { friendId } = req.params

    // Check if there's a friendId
    if (!friendId) {
      return res.status(400).json({ error: 'friendId is required' })
    }

    // Fetch the friendship entry
    const friendship = await Friendship.get({ userId, friendId })
    if (!friendship || friendship.status !== 'PENDING') {
      return res
        .status(404)
        .json({ error: 'Friend request not found or already processed.' })
    }

    // Update the status to ACCEPTED
    friendship.status = 'ACCEPTED'
    friendship.updatedAt = new Date().toISOString()
    await friendship.save()

    // Update the reverse entry as well
    const reverseFriendship = await Friendship.get({
      userId: friendId,
      friendId: userId
    })
    if (reverseFriendship) {
      reverseFriendship.status = 'ACCEPTED'
      reverseFriendship.updatedAt = new Date().toISOString()
      await reverseFriendship.save()
    }

    res.status(200).json({ message: 'Friend request accepted.', friendship })
  } catch (error) {
    handleError(error, req, res)
  }
}

// Delete a friendship (used for canceling, rejecting, or unfriending)
exports.deleteFriendship = async (req, res) => {
  try {
    const userId = req.user.id // Extracted from JWT middleware
    const { friendId } = req.params // The ID of the other user

    // Check if there's a friendId
    if (!friendId) {
      return res
        .status(400)
        .json({ message: 'friendId is required.', data: null })
    }

    // Fetch the friendship entry
    const friendship = await Friendship.get({ userId, friendId })
    if (!friendship) {
      return res
        .status(404)
        .json({ message: 'Friendship not found.', data: null })
    }

    // Delete the friendship entry
    await Friendship.delete({ userId, friendId })

    // Delete the reverse entry as well
    await Friendship.delete({ userId: friendId, friendId: userId })

    res.status(200).json({
      message: 'Friendship removed successfully',
      data: null
    })
  } catch (error) {
    handleError(error, req, res)
  }
}

// List all friends
exports.listFriends = async (req, res) => {
  try {
    const userId = req.user.id

    // Query using the LSI
    const friendships = await Friendship.query('userId')
      .eq(userId)
      .using('StatusIndex') // Use the LSI
      .where('status')
      .eq('ACCEPTED')
      .exec()

    res.status(200).json({ friends: friendships })
  } catch (error) {
    handleError(error, req, res)
  }
}

// List sent friend requests
exports.listSentRequests = async (req, res) => {
  try {
    const userId = req.user.id // Extracted from JWT middleware

    // Query for all PENDING requests for the user
    const allPendingRequests = await Friendship.query('userId')
      .eq(userId)
      .where('status')
      .eq('PENDING')
      .exec()

    // Filter to include only requests where the current user is the initiator
    const sentRequests = allPendingRequests.filter(
      (request) => request.initiatorId === userId
    )

    res.status(200).json({
      message: 'Sent friend requests retrieved successfully.',
      sentRequests
    })
  } catch (error) {
    handleError(error, req, res)
  }
}

// List received friend requests
exports.listReceivedRequests = async (req, res) => {
  try {
    const userId = req.user.id // Extracted from JWT middleware

    // Query for all PENDING requests for the user
    const allPendingRequests = await Friendship.query('userId')
      .eq(userId)
      .where('status')
      .eq('PENDING')
      .exec()

    // Filter to include only requests where the current user is NOT the initiator
    const receivedRequests = allPendingRequests.filter(
      (request) => request.initiatorId !== userId
    )

    res.status(200).json({
      message: 'Received friend requests retrieved successfully.',
      receivedRequests
    })
  } catch (error) {
    handleError(error, req, res)
  }
}
