const Friendship = require('../models/friendshipModel')
const User = require('../models/userModel')
const { handleError } = require('../utils')

/**
 * Deletes a friendship entry and its reverse entry.
 * @param {string} userId - The ID of the user initiating the deletion.
 * @param {string} friendId - The ID of the other user in the friendship.
 */
const deleteFriendshipEntry = async (userId, friendId) => {
  // Delete the friendship entry
  await Friendship.delete({ userId, friendId })

  // Delete the reverse entry as well
  await Friendship.delete({ userId: friendId, friendId: userId })
}

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
      return res.status(400).json({
        error: 'Friendship already exists (either accepted or pending).'
      })
    }

    // Get the current timestamp
    const timestamp = new Date().toISOString()

    // Create bi-directional friendship entries
    const friendship1 = new Friendship({
      userId,
      friendId,
      initiatorId: userId,
      status: 'PENDING',
      createdAt: timestamp,
      updatedAt: timestamp
    })

    const friendship2 = new Friendship({
      userId: friendId,
      friendId: userId,
      initiatorId: userId,
      status: 'PENDING',
      createdAt: timestamp,
      updatedAt: timestamp
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
    const { friendId } = req.params // The ID of the other user

    // Check if there's a friendId
    if (!friendId) {
      return res
        .status(400)
        .json({ message: 'friendId is required.', data: null })
    }

    // Fetch the friendship entry
    const friendship = await Friendship.get({ userId, friendId })
    if (!friendship || friendship.status !== 'PENDING') {
      return res.status(404).json({
        message: 'Friend request not found or already processed.',
        data: null
      })
    }

    // Ensure the current user is the recipient of the friend request
    if (friendship.initiatorId === userId) {
      return res.status(403).json({
        message: 'You cannot accept a friend request you sent.',
        data: null
      })
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

    res.status(200).json({
      message: 'Friend request accepted successfully.',
      friendship
    })
  } catch (error) {
    handleError(error, req, res)
  }
}

// List all friends
exports.listFriends = async (req, res) => {
  try {
    const userId = req.user.id

    // Query friendships where the current user is involved and the status is ACCEPTED
    const friendships = await Friendship.query('userId')
      .eq(userId)
      .using('StatusIndex') // Use the LSI
      .where('status')
      .eq('ACCEPTED')
      .exec()

    // Extract the friendIds from the friendships
    const friendIds = friendships.map((friendship) => friendship.friendId)

    // Fetch user profiles for each friendId
    const friends = await Promise.all(
      friendIds.map(async (friendId) => {
        const friend = await User.get(friendId)
        return {
          userId: friend.id,
          profile: friend.profile
        }
      })
    )

    res.status(200).json({
      message: 'Friends retrieved successfully.',
      friends
    })
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

    // Fetch user profiles for each friendId
    const requests = await Promise.all(
      sentRequests.map(async (request) => {
        const friend = await User.get(request.friendId)
        return {
          userId: friend.id,
          profile: friend.profile,
          createdAt: request.createdAt // Include the createdAt field
        }
      })
    )

    res.status(200).json({
      message: 'Sent friend requests retrieved successfully.',
      requests
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

    // Fetch user profiles for each friendId
    const requests = await Promise.all(
      receivedRequests.map(async (request) => {
        const friend = await User.get(request.friendId)
        return {
          userId: friend.id,
          profile: friend.profile,
          createdAt: request.createdAt // Include the createdAt field
        }
      })
    )

    res.status(200).json({
      message: 'Received friend requests retrieved successfully.',
      requests
    })
  } catch (error) {
    handleError(error, req, res)
  }
}

// Cancel a sent friend request
exports.cancelFriendRequest = async (req, res) => {
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
    if (
      !friendship ||
      friendship.initiatorId !== userId ||
      friendship.status !== 'PENDING'
    ) {
      return res.status(403).json({
        message: 'You can only cancel your own pending friend requests.',
        data: null
      })
    }

    // Delete the friendship entry
    await deleteFriendshipEntry(userId, friendId)

    res.status(200).json({
      message: 'Friend request canceled successfully.',
      data: null
    })
  } catch (error) {
    handleError(error, req, res)
  }
}

// Reject a received friend request
exports.rejectFriendRequest = async (req, res) => {
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
    if (
      !friendship ||
      friendship.initiatorId === userId ||
      friendship.status !== 'PENDING'
    ) {
      return res.status(403).json({
        message: 'You can only reject friend requests sent to you.',
        data: null
      })
    }

    // Delete the friendship entry
    await deleteFriendshipEntry(userId, friendId)

    res.status(200).json({
      message: 'Friend request rejected successfully.',
      data: null
    })
  } catch (error) {
    handleError(error, req, res)
  }
}

// Unfriend an existing friend
exports.unfriend = async (req, res) => {
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
    if (!friendship || friendship.status !== 'ACCEPTED') {
      return res
        .status(404)
        .json({ message: 'Friendship not found.', data: null })
    }

    // Delete the friendship entry
    await deleteFriendshipEntry(userId, friendId)

    res.status(200).json({
      message: 'Friendship removed successfully.',
      data: null
    })
  } catch (error) {
    handleError(error, req, res)
  }
}
