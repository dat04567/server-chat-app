const Conversation = require('../models/conversationModel')
const ConversationParticipants = require('../models/conversationParticipantsModel')
const Message = require('../models/messageModel')
const User = require('../models/userModel')

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

    // Create the new conversation
    const newConversation = new Conversation({
      type: 'ONE-TO-ONE',
      participantPairKey,
      lastMessageText: content, // Set the initial message as the last message
      lastMessageAt: new Date().toISOString() // Set the timestamp of the initial message
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
  // implement later
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
    const { limit, lastEvaluatedKey } = req.query

    const pageSize = parseInt(limit, 10) || 10

    // Step 1: Fetch all conversationParticipants for the user
    let participantRecords = []
    let lastKey

    do {
      const result = await ConversationParticipants.query('userId')
        .eq(userId)
        .startAt(lastKey)
        .exec()

      participantRecords = participantRecords.concat(result)
      lastKey = result.lastKey
    } while (lastKey)

    if (participantRecords.length === 0) {
      return res.status(200).json({
        conversations: [],
        lastEvaluatedKey: null
      })
    }

    // Step 2: Extract conversationIds
    const conversationIds = participantRecords.map(
      (record) => record.conversationId
    )

    // Step 3: Fetch conversations from the conversations table
    const conversationPromises = conversationIds.map((conversationId) =>
      Conversation.get(conversationId)
    )
    const conversations = await Promise.all(conversationPromises)

    // Step 4: Construct the response
    const responseConversations = await Promise.all(
      conversations
        .filter((conversation) => conversation) // Filter out null results (if any)
        .map(async (conversation) => {
          const recipientId = extractRecipientId(
            conversation.participantPairKey,
            userId
          )
          const recipient = await User.get(recipientId) // Query recipient's profile

          return {
            conversationId: conversation.conversationId,
            lastMessageAt: conversation.lastMessageAt,
            lastMessageText: conversation.lastMessageText,
            type: conversation.type,
            isDeleted: conversation.isDeleted,
            recipient: {
              userId: recipient.id,
              profile: recipient.profile
            }
          }
        })
    )

    // Step 5: Sort conversations by lastMessageAt in descending order
    responseConversations.sort(
      (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
    )

    // Step 6: Apply pagination at the application level
    const startIndex = lastEvaluatedKey ? parseInt(lastEvaluatedKey, 10) : 0
    const paginatedConversations = responseConversations.slice(
      startIndex,
      startIndex + pageSize
    )

    // Step 7: Generate the next page token
    const nextPageToken =
      startIndex + pageSize < responseConversations.length
        ? (startIndex + pageSize).toString()
        : null

    // Step 8: Return the results
    res.status(200).json({
      conversations: paginatedConversations,
      lastEvaluatedKey: nextPageToken
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Check if a user is in a conversation
 */
const isUserInConversation = async (userId, conversationId) => {
  const participant = await ConversationParticipants.query('conversationId')
    .eq(conversationId)
    .where('userId')
    .eq(userId)
    .exec()
  return participant.length > 0
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
