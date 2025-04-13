const dynamoose = require('../config/database')
const { v4: uuidv4 } = require('uuid') // Import UUID v4 for unique IDs

const conversationSchema = new dynamoose.Schema({
  // Partition Key
  conversationId: {
    type: String,
    hashKey: true,
    default: () => uuidv4(), // Automatically generate a UUID v4
  },
  type: {
    type: String,
    enum: ['ONE-TO-ONE', 'GROUP'],
    required: true,
  },
  // ONE-TO-ONE only (GSI)
  participantPairKey: {
    type: String,
    required: function () {
      return this.type === 'ONE-TO-ONE'
    },
    index: {
      global: true,
      name: 'participantPairKeyIndex',
    },
  },
  // GROUP only
  groupImage: {
    type: String,
  },
  groupName: {
    type: String,
  },
  creatorId: {
    type: String,
    required: function () {
      return this.type === 'GROUP'
    },
  },
  // Common fields
  createdAt: {
    type: String,
    default: () => new Date().toISOString(),
  },
  updatedAt: {
    type: String,
    default: () => new Date().toISOString(),
  },
  lastMessageText: {
    type: String,
  },
  lastMessageAt: {
    type: String,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
})

const Conversation = dynamoose.model('conversations', conversationSchema)
module.exports = Conversation
