const Conversation = require('../models/conversationModel')
const ConversationParticipants = require('../models/conversationParticipantsModel')
const Message = require('../models/messageModel')
const User = require('../models/userModel')
const { isUserInConversation } = require('../utils/authorization')
const Friendship = require('../models/friendshipModel')
const { handleError } = require('../utils')
const { v4: uuidv4 } = require('uuid')

/**
 * Create a ONE-TO-ONE conversation
 */
exports.createOneToOneConversation = async (req, res) => {
  try {
    const { recipientId, content } = req.body
    const senderId = req.user.id // Use the authenticated user's ID from authMiddleware

    // Validate input
    if (!recipientId || !content) {
      return res.status(400).json({
        error:
          'recipientId and initial message content are required for creating a ONE-TO-ONE conversation'
      })
    }

    // Verify that the recipient exists
    const recipient = await User.get(recipientId) // Assuming User is your user model
    if (!recipient) {
      return res.status(404).json({
        error: 'Recipient does not exist'
      })
    }

    // Generate participantPairKey
    const sortedIds = [senderId, recipientId].sort()
    const participantPairKey = `${sortedIds[0]}#${sortedIds[1]}`

    // Check if the conversation already exists
    const existingConversation = await Conversation.query('participantPairKey')
      .eq(participantPairKey)
      .exec()

    console.log(existingConversation)

    if (existingConversation.length > 0) {
      return res.status(200).json({
        message: 'Conversation already exists',
        conversation: existingConversation[0]
      }) // Return the existing conversation
    }

    const currentTime = new Date().toISOString()
    // console.log(currentTime)
    // Create the new conversation
    const newConversation = new Conversation({
      conversationId: uuidv4(),
      type: 'ONE-TO-ONE',
      participantPairKey,
      createdAt: currentTime,
      updatedAt: currentTime,
      lastMessageText: content, // Set the initial message as the last message
      lastMessageAt: currentTime, // Set the timestamp of the initial message
      isDeleted: false
    })

    const savedConversation = await newConversation.save()

    // Add participants to the ConversationParticipants table
    const participants = [
      {
        userId: senderId,
        conversationId: savedConversation.conversationId,
        lastMessageAt: savedConversation.lastMessageAt
      },
      {
        userId: recipientId,
        conversationId: savedConversation.conversationId,
        lastMessageAt: savedConversation.lastMessageAt
      }
    ]

    await Promise.all(
      participants.map((participant) =>
        ConversationParticipants.create(participant)
      )
    )

    // Create the initial message in the Messages table
    const newMessage = new Message({
      conversationId: savedConversation.conversationId,
      senderId,
      recipientId,
      type: 'TEXT',
      content,
      createdAt: savedConversation.lastMessageAt,
      updatedAt: savedConversation.lastMessageAt
    })

    const savedMessage = await newMessage.save()

    // Return the full conversation details along with the message
    res.status(201).json({
      message: 'Conversation created successfully',
      conversation: savedConversation,
      initialMessage: savedMessage
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Create a GROUP conversation
 */
exports.createGroupConversation = async (req, res) => {
  try {
    const creatorId = req.user.id // Extracted from JWT middleware
    const { participantIds, groupName, groupImage } = req.body

    // Validate participantIds
    if (!participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({
        message: 'A list of participant IDs is required.',
        data: null
      })
    }

    // Filter out duplicate IDs and ensure the creator is included
    const uniqueParticipantIds = [...new Set(participantIds)]
    if (!uniqueParticipantIds.includes(creatorId)) {
      uniqueParticipantIds.push(creatorId)
    }

    // Ensure the group has at least 3 members (including the creator)
    if (uniqueParticipantIds.length < 3) {
      return res.status(400).json({
        message: 'A group must have at least 3 members, including the creator.',
        data: null
      })
    }

    // Validate that all participants are friends of the creator (excluding the creator)
    const filteredParticipantIds = uniqueParticipantIds.filter(
      (id) => id !== creatorId
    )
    const invalidParticipants = await Promise.all(
      filteredParticipantIds.map(async (participantId) => {
        const friendship = await Friendship.get({
          userId: creatorId,
          friendId: participantId
        })
        const reverseFriendship = await Friendship.get({
          userId: participantId,
          friendId: creatorId
        })
        if (
          (!friendship || friendship.status !== 'ACCEPTED') &&
          (!reverseFriendship || reverseFriendship.status !== 'ACCEPTED')
        ) {
          return participantId
        }
        return null
      })
    )

    const nonFriends = invalidParticipants.filter((id) => id !== null)

    if (nonFriends.length > 0) {
      return res.status(400).json({
        message: 'All participants must be friends of the creator.',
        nonFriends,
        data: null
      })
    }

    const initialMessageContent = 'Welcome to my group'

    console.log(`get here ${initialMessageContent}`)

    // Create the group conversation
    const conversation = new Conversation({
      conversationId: uuidv4(),
      type: 'GROUP',
      groupName: groupName || 'Untitled Group',
      groupImage: groupImage || 'default image group url',
      creatorId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessageText: initialMessageContent, // Set the initial message as the last message
      lastMessageAt: new Date().toISOString(), // Set the timestamp of the initial message
      isDeleted: false
    })

    await conversation.save()

    // Add participants to the conversation
    const participants = uniqueParticipantIds.map((participantId) => ({
      conversationId: conversation.conversationId,
      userId: participantId,
      isAdmin: participantId === creatorId, // Set the creator as admin
      joinedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
      lastMessageAt: conversation.lastMessageAt
    }))

    await ConversationParticipants.batchPut(participants)

    // Create the initial message in the Messages table
    const initialMessage = new Message({
      conversationId: conversation.conversationId,
      senderId: creatorId,
      type: 'TEXT',
      content: conversation.lastMessageText,
      createdAt: conversation.lastMessageAt,
      updatedAt: conversation.lastMessageAt
    })

    await initialMessage.save()

    res.status(201).json({
      message: 'Group conversation created successfully.',
      conversation,
      participants,
      initialMessage
    })
  } catch (error) {
    handleError(error, req, res)
  }
}

/**
 * Get a specific conversation by ID
 */
exports.getConversationById = async (req, res) => {
  try {
    const { conversationId } = req.params
    const userId = req.user.id // Use the authenticated user's ID from authMiddleware

    // Check if the user is a participant in the conversation
    const isAuthorized = await isUserInConversation(userId, conversationId)
    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access denied. You are not a participant in this conversation.'
      })
    }

    // Fetch the conversation
    const conversation = await Conversation.get(conversationId)

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    conversation.conversationId = conversationId // Ensure conversationId is included in the response

    res.status(200).json(conversation)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get all conversations for a user
 */
exports.getConversationsForUser = async (req, res) => {
  try {
    const userId = req.user.id // Use the authenticated user's ID from authMiddleware

    // Step 1: Fetch all conversationParticipants for the user
    const participantRecords = await ConversationParticipants.query('userId')
      .eq(userId)
      .exec()

    if (participantRecords.length === 0) {
      return res.status(200).json({
        conversations: []
      })
    }

    // Step 2: Fetch all conversations based on participantRecords
    const conversationIds = participantRecords.map(
      (record) => record.conversationId
    )

    const conversations = await Promise.all(
      conversationIds.map((conversationId) =>
        Conversation.get({ conversationId })
      )
    )

    // Step 3: Format the response
    const responseConversations = await Promise.all(
      conversations.map(async (conversation) => {
        // Find the participant record for the current user in this conversation
        const participantRecord = participantRecords.find(
          (record) => record.conversationId === conversation.conversationId
        )

        if (conversation.type === 'GROUP') {
          // Include group-specific fields for GROUP conversations
          return {
            conversationId: conversation.conversationId,
            type: conversation.type,
            groupName: conversation.groupName,
            groupImage: conversation.groupImage,
            lastMessageText: conversation.lastMessageText,
            lastMessageAt: conversation.lastMessageAt,
            isDeleted: conversation.isDeleted,
            unread: participantRecord ? participantRecord.unread : false // Include unread field
          }
        } else if (conversation.type === 'ONE-TO-ONE') {
          // Include recipient details for ONE-TO-ONE conversations
          const recipientId = extractRecipientId(
            conversation.participantPairKey,
            userId
          )

          const recipient = await User.get(recipientId)

          return {
            conversationId: conversation.conversationId,
            type: conversation.type,
            lastMessageText: conversation.lastMessageText,
            lastMessageAt: conversation.lastMessageAt,
            isDeleted: conversation.isDeleted,
            unread: participantRecord ? participantRecord.unread : false, // Include unread field
            recipient: {
              userId: recipientId,
              profile: recipient.profile
            }
          }
        }
      })
    )

    // Step 4: Sort conversations by lastMessageAt (latest to oldest)
    const sortedConversations = responseConversations.sort((a, b) => {
      const dateA = new Date(a.lastMessageAt)
      const dateB = new Date(b.lastMessageAt)
      return dateB - dateA // Sort in descending order
    })

    // Return the full list of conversations
    res.status(200).json({
      conversations: sortedConversations
    })
  } catch (error) {
    console.error('Error fetching conversations:', error)
    res.status(500).json({ error: error.message })
  }
}

/**
 * Extract the recipient's ID from the participantPairKey
 * @param {string} participantPairKey - The participant pair key (e.g., "userId1#userId2")
 * @param {string} currentUserId - The ID of the current user
 * @returns {string} - The recipient's ID
 */
const extractRecipientId = (participantPairKey, currentUserId) => {
  const [id1, id2] = participantPairKey.split('#') // Split the key into two IDs
  return id1 === currentUserId ? id2 : id1 // Return the ID that is not the current user's ID
}
