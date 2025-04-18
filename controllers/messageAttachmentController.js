const MessageAttachments = require('../models/messageAttachmentsModel')
const { uploadFileToS3 } = require('../utils/s3Service')
const { isUserInConversation } = require('../utils/authorization') // Import the authorization utility

/**
 * Upload a new attachment
 */
exports.uploadAttachment = async (req, res) => {
  try {
    const { messageId, conversationId, type } = req.body
    const userId = req.user.id // Authenticated user's ID from authMiddleware

    // Validate input
    if (!messageId || !conversationId || !type) {
      return res
        .status(400)
        .json({ error: 'messageId, conversationId, and type are required' })
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ error: 'File is required for uploading an attachment' })
    }

    // Check if the user is a participant in the conversation
    const isAuthorized = await isUserInConversation(userId, conversationId)
    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Access denied. You are not a participant in this conversation.'
      })
    }

    // Upload the file to S3
    const fileBuffer = req.file.buffer
    const fileName = req.file.originalname
    const mimeType = req.file.mimetype
    const folder = type.toLowerCase() // Use the type as the folder name in S3
    const url = await uploadFileToS3(fileBuffer, fileName, folder)

    // Create the attachment
    const attachment = new MessageAttachments({
      messageId,
      conversationId,
      type,
      url,
      fileName,
      mimeType
    })

    const savedAttachment = await attachment.save()

    res.status(201).json({
      message: 'Attachment uploaded successfully',
      attachment: savedAttachment
    })
  } catch (error) {
    console.error('Error uploading attachment:', error)
    res.status(500).json({ error: error.message })
  }
}

/**
 * Fetch all attachments for a conversation with pagination
 */
exports.getAttachmentsByConversation = async (req, res) => {
  try {
    const { conversationId } = req.params
    const { limit, lastEvaluatedKey } = req.query // Pagination parameters
    const userId = req.user.id

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

    const pageSize = parseInt(limit, 10) || 10 // Default page size is 10

    // Query attachments by conversationId
    const query = MessageAttachments.query('conversationId')
      .eq(conversationId)
      .using('conversationId-createdAt-index') // Use the GSI
      .sort('descending') // Sort by createdAt in descending order (latest to oldest)
      .limit(pageSize)

    // Apply pagination if lastEvaluatedKey is provided
    if (lastEvaluatedKey) {
      query.startAt(JSON.parse(lastEvaluatedKey)) // Parse the key from the query string
    }

    const result = await query.exec()

    res.status(200).json({
      message: 'Attachments fetched successfully',
      attachments: result, // The list of attachments
      lastEvaluatedKey: result.lastKey ? JSON.stringify(result.lastKey) : null // Return the next page token
    })
  } catch (error) {
    console.error('Error fetching attachments:', error)
    res.status(500).json({ error: error.message })
  }
}

/**
 * Fetch all attachments for a specific message
 */
exports.getAttachmentsByMessage = async (req, res) => {
  try {
    const { messageId } = req.params

    // Validate input
    if (!messageId) {
      return res.status(400).json({ error: 'messageId is required' })
    }

    // Query attachments by messageId
    const attachments = await MessageAttachments.query('messageId')
      .eq(messageId)
      .sort('ascending') // Sort by attachmentId
      .exec()

    res.status(200).json({
      message: 'Attachments fetched successfully',
      attachments
    })
  } catch (error) {
    console.error('Error fetching attachments:', error)
    res.status(500).json({ error: error.message })
  }
}

/**
 * Delete an attachment
 */
exports.deleteAttachment = async (req, res) => {
  try {
    const { messageId, attachmentId } = req.params

    // Validate input
    if (!messageId || !attachmentId) {
      return res
        .status(400)
        .json({ error: 'messageId and attachmentId are required' })
    }

    // Delete the attachment
    await MessageAttachments.delete({ messageId, attachmentId })

    res.status(200).json({
      message: 'Attachment deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting attachment:', error)
    res.status(500).json({ error: error.message })
  }
}
