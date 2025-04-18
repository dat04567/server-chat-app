const dynamoose = require('../config/database')
const { v1: uuidv1 } = require('uuid') // Import UUID v1 for unique and time-ordered IDs

const messageSchema = new dynamoose.Schema({
  // Partition Key
  conversationId: {
    type: String,
    hashKey: true // Partition key
  },
  // Composite Sort Key
  messageId: {
    type: String,
    rangeKey: true, // Sort key
    default: () => `${new Date().toISOString()}_${uuidv1()}` // Combine createdAt and UUID v1
  },
  createdAt: {
    type: String,
    default: () => new Date().toISOString() // Automatically set the creation timestamp
  },
  updatedAt: {
    type: String,
    default: () => new Date().toISOString() // Automatically set the updated timestamp
  },
  senderId: {
    type: String,
    required: true // Sender ID is mandatory
  },
  recipientId: {
    type: String,
    required: function () {
      // required for one-to-one conversations
      return this.type === 'ONE-TO-ONE'
    }
  },
  type: {
    type: String,
    enum: ['TEXT', 'MEDIA'], // Allowed message types
    required: true // Message type is mandatory
  },
  content: {
    type: String,
    required: function () {
      // Only required for TEXT messages
      return this.type === 'TEXT'
    }
  },
  status: {
    type: String,
    enum: ['SENT', 'SEEN', 'RECALLED', 'PINNED'], // Allowed statuses
    default: 'SENT' // Default status is "SENT"
  },
  forwardedFromMessageId: {
    type: String // Optional field for forwarded messages
  }
})

const Message = dynamoose.model('Messages', messageSchema)
module.exports = Message
