const Conversation = require('../models/conversationModel')
const ConversationParticipants = require('../models/conversationParticipantsModel')
const Message = require('../models/messageModel')

exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params // Extract conversationId from req.params
    const { senderId, recipientId, content } = req.body // Extract other fields from req.body

    // Validate input
    if (!conversationId || !senderId || !content) {
      return res
        .status(400)
        .json({ error: 'conversationId, senderId, and content are required' })
    }

    // Create the message
    const newMessage = new Message({
      conversationId,
      senderId,
      recipientId,
      type: 'TEXT',
      content,
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
            conversationId: participant.conversationId,
          }, // Composite key
          { lastMessageAt }
        )
      )
    )

    res.status(201).json(savedMessage)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

exports.getMessagesForConversation = async (req, res) => {
  try {
    const { conversationId } = req.params // Extract conversationId from req.params
    const { limit, lastMessageId } = req.query // Extract lastMessageId from req.query

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' })
    }

    const pageSize = parseInt(limit, 10) || 10

    // Query messages for the conversation, sorted by messageId (time-based uuid v1)
    const query = Message.query('conversationId')
      .eq(conversationId)
      .limit(pageSize)
      .sort('descending') // Sort by messageId in descending order (newest to oldest)

    if (lastMessageId) {
      query.startAt({ conversationId, messageId: lastMessageId }) // Reconstruct the lastEvaluatedKey
    }

    const messages = await query.exec()

    res.status(200).json({
      messages,
      lastEvaluatedKey: messages.lastKey
        ? { messageId: messages.lastKey.messageId } // Only return the messageId
        : null,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

exports.getMessageById = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params

    if (!conversationId || !messageId) {
      return res
        .status(400)
        .json({ error: 'conversationId and messageId are required' })
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
