const Conversation = require('../models/conversationModel')
const ConversationParticipants = require('../models/conversationParticipantsModel')
const Message = require('../models/messageModel')

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
 * Send a message in a conversation
 */
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params // Extract conversationId from req.params
    const { content } = req.body // Extract content from req.body
    const senderId = req.user.id // Use the authenticated user's ID from authMiddleware

    // Validate input
    if (!conversationId || !content) {
      return res
        .status(400)
        .json({ error: 'conversationId and content are required' })
    }

    // Check if the user is a participant in the conversation
    const isAuthorized = await isUserInConversation(senderId, conversationId)
    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access denied. You are not a participant in this conversation.'
      })
    }

    // Create the message
    const newMessage = new Message({
      conversationId,
      senderId,
      type: 'TEXT',
      content
    })

    const savedMessage = await newMessage.save()

    // Update the lastMessageAt and lastMessageText in the Conversations table
    const lastMessageAt = savedMessage.createdAt
    const lastMessageText = content
    await Conversation.update(
      { conversationId },
      { lastMessageAt, lastMessageText }
    )

    // Use the GSI to query participants by conversationId
    const participants = await ConversationParticipants.query('conversationId')
      .using('conversationIdIndex') // Use the GSI
      .eq(conversationId)
      .exec()

    // Update the lastMessageAt for all participants
    await Promise.all(
      participants.map((participant) =>
        ConversationParticipants.update(
          {
            userId: participant.userId,
            conversationId: participant.conversationId
          }, // Composite key
          { lastMessageAt }
        )
      )
    )

    res.status(201).json({
      message: 'Message sent successfully',
      savedMessage
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get messages for a conversation with pagination
 */
exports.getMessagesForConversation = async (req, res) => {
  try {
    const { conversationId } = req.params // Extract conversationId from req.params
    const { limit, lastMessageId } = req.query // Extract pagination parameters
    const userId = req.user.id // Use the authenticated user's ID from authMiddleware

    // Validate input
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' })
    }

    // Check if the user is a participant in the conversation
    const isAuthorized = await isUserInConversation(userId, conversationId)
    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access denied. You are not a participant in this conversation.'
      })
    }

    const pageSize = parseInt(limit, 10) || 10 // Default to 10 messages per page

    // Query messages for the conversation, sorted by messageId (time-based uuid v1)
    const query = Message.query('conversationId')
      .eq(conversationId)
      .sort('descending') // Sort by messageId in descending order (newest to oldest)
      .limit(pageSize)

    if (lastMessageId) {
      query.startAt({ conversationId, messageId: lastMessageId }) // Reconstruct the lastEvaluatedKey
    }

    const messages = await query.exec()
    console.log(messages)

    res.status(200).json({
      messages,
      lastEvaluatedKey: messages.lastKey
        ? { messageId: messages.lastKey.messageId } // Only return the messageId
        : null
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get a specific message by ID
 */
exports.getMessageById = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params

    console.log(conversationId + ' --- ' + messageId)
    const userId = req.user.id // Use the authenticated user's ID from authMiddleware

    // Validate input
    if (!conversationId || !messageId) {
      return res
        .status(400)
        .json({ error: 'conversationId and messageId are required' })
    }

    // Check if the user is a participant in the conversation
    const isAuthorized = await isUserInConversation(userId, conversationId)
    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access denied. You are not a participant in this conversation.'
      })
    }

    const message = await Message.get({ conversationId, messageId })

    if (!message) {
      return res.status(404).json({ error: 'Message not found' })
    }

    res.status(200).json(message)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
