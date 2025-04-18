const Conversation = require('../models/conversationModel')
const ConversationParticipants = require('../models/conversationParticipantsModel')
const Message = require('../models/messageModel')
const MessageAttachments = require('../models/messageAttachmentsModel')
const { uploadAttachments } = require('../utils/s3Service') // Import the utility function
const { isUserInConversation } = require('../utils/authorization')
/**
 * Send a message in a conversation
 */
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params // Extract conversationId from req.params
    const { content, type } = req.body // Extract content and type from req.body
    const senderId = req.user.id // Use the authenticated user's ID from authMiddleware

    // Validate input
    if (!conversationId || !type) {
      return res
        .status(400)
        .json({ error: 'conversationId and type are required' })
    }

    if (type === 'TEXT' && !content) {
      return res
        .status(400)
        .json({ error: 'Content is required for TEXT messages' })
    }

    if (type === 'MEDIA' && (!req.files || req.files.length === 0)) {
      return res
        .status(400)
        .json({ error: 'At least one file is required for MEDIA messages' })
    }

    // Check if the user is a participant in the conversation
    const isAuthorized = await isUserInConversation(senderId, conversationId)
    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access denied. You are not a participant in this conversation.'
      })
    }

    // Fetch the conversation to determine its type
    const conversation = await Conversation.get({ conversationId })
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    let recipientId = null

    // If it's a ONE-TO-ONE conversation, extract the recipientId
    if (conversation.type === 'ONE-TO-ONE') {
      const participants = await ConversationParticipants.query(
        'conversationId'
      )
        .eq(conversationId)
        .exec()

      if (participants.length !== 2) {
        return res.status(400).json({
          error:
            'Invalid one-to-one conversation. Expected exactly 2 participants.'
        })
      }

      // Identify the recipientId (the other participant in the conversation)
      recipientId = participants.find(
        (participant) => participant.userId !== senderId
      )?.userId

      if (!recipientId) {
        return res.status(400).json({
          error: 'Unable to determine the recipient for this conversation.'
        })
      }
    }

    // Handle file uploads for MEDIA messages
    let attachments = []
    if (type === 'MEDIA' && req.files) {
      attachments = await uploadAttachments(req.files) // Use the utility function to upload files
    }

    // Create the message
    const newMessage = new Message({
      conversationId,
      senderId,
      recipientId, // Add recipientId only for ONE-TO-ONE conversations
      type,
      content: type === 'TEXT' ? content : null // Content is only required for TEXT messages
    })

    const savedMessage = await newMessage.save()

    // Save attachments if any
    if (attachments.length > 0) {
      await Promise.all(
        attachments.map(async (attachment) => {
          attachment.messageId = savedMessage.messageId // Associate the attachment with the message
          const newAttachment = new MessageAttachments(attachment)
          await newAttachment.save()
        })
      )
    }

    // Update the lastMessageAt and lastMessageText in the Conversations table
    const lastMessageAt = savedMessage.createdAt
    const lastMessageText = type === 'TEXT' ? content : '[Media]'
    await Conversation.update(
      { conversationId },
      { lastMessageAt, lastMessageText }
    )

    // Update the lastMessageAt for all participants
    const participants = await ConversationParticipants.query('conversationId')
      .eq(conversationId)
      .exec()

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
      savedMessage,
      attachments // Include attachments in the response
    })
  } catch (error) {
    console.error('Error sending message:', error)
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get messages for a conversation with pagination
 */
exports.getMessagesForConversation = async (req, res) => {
  try {
    const { conversationId } = req.params
    const { limit, lastEvaluatedKey } = req.query
    const userId = req.user.id // Authenticated user's ID

    // Check if the user is a participant in the conversation
    const isAuthorized = await isUserInConversation(userId, conversationId)
    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access denied. You are not a participant in this conversation.'
      })
    }

    // Validate input
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' })
    }

    const pageSize = parseInt(limit, 10) || 10

    // Query messages by conversationId
    const query = Message.query('conversationId')
      .eq(conversationId)
      .sort('descending') // Sort by createdAt in descending order
      .limit(pageSize)

    if (lastEvaluatedKey) {
      query.startAt(JSON.parse(lastEvaluatedKey))
    }

    const messages = await query.exec()

    // Fetch attachments and map the desired fields
    const messagesWithAttachments = await Promise.all(
      messages.map(async (message) => {
        // Fetch attachments for the message
        const attachments = await MessageAttachments.query('messageId')
          .eq(message.messageId)
          .sort('ascending') // Sort by attachmentId
          .exec()

        // Return only the desired fields for the message
        return {
          conversationId: message.conversationId,
          messageId: message.messageId,
          createdAt: message.createdAt,
          senderId: message.senderId,
          type: message.type,
          content: message.content,
          status: message.status,
          isCurrentUserSender: message.senderId === userId, // Determine if the current user is the sender
          attachments: attachments.map((attachment) => ({
            url: attachment.url,
            type: attachment.type,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType
          }))
        }
      })
    )

    res.status(200).json({
      messages: messagesWithAttachments,
      lastEvaluatedKey: messages.lastKey
        ? JSON.stringify(messages.lastKey)
        : null
    })
  } catch (error) {
    console.error('Error fetching messages:', error)
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
