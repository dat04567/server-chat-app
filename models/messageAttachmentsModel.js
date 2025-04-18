const dynamoose = require('../config/database')
const { v4: uuidv4 } = require('uuid') // Import UUID v4 for unique attachment IDs

const messageAttachmentsSchema = new dynamoose.Schema({
  // Partition Key
  messageId: {
    type: String,
    hashKey: true // Partition key
  },
  // Sort Key
  attachmentId: {
    type: String,
    rangeKey: true, // Sort key
    default: () => `${new Date().toISOString()}_${uuidv4()}` // Combine ISO timestamp and UUID v4
  },
  // GSI for querying attachments by conversationId
  conversationId: {
    type: String,
    index: {
      global: true,
      name: 'conversationId-createdAt-index', // GSI name
      rangeKey: 'createdAt' // Sort key for the GSI
    }
  },
  type: {
    type: String,
    enum: ['IMAGE', 'VIDEO', 'FILE'], // Allowed attachment types
    required: true
  },
  url: {
    type: String,
    required: true // S3 URL where the attachment is stored
  },
  fileName: {
    type: String // Name of the file
  },
  mimeType: {
    type: String // MIME type of the file
  },
  createdAt: {
    type: String,
    default: () => new Date().toISOString() // Automatically set the creation timestamp
  }
})

const MessageAttachments = dynamoose.model(
  'MessageAttachments',
  messageAttachmentsSchema
)

module.exports = MessageAttachments
