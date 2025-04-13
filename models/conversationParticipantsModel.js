const dynamoose = require('../config/database')

const conversationParticipantsSchema = new dynamoose.Schema(
  {
    userId: {
      type: String,
      hashKey: true, // Partition key
    },
    conversationId: {
      type: String,
      rangeKey: true, // Sort key
    },
    lastMessageAt: {
      type: String, // Timestamp of the last message in the conversation
      required: true,
    },
    joinedAt: {
      type: String,
      default: () => new Date().toISOString(), // Automatically set the join timestamp
    },
    isAdmin: {
      type: Boolean,
    },
    lastReadAt: {
      type: String,
    },
    isMuted: {
      type: Boolean,
      default: false, // Default to false
    },
    isArchived: {
      type: Boolean,
      default: false, // Default to false
    },
  },
  {
    // for querying all participants in a conversation
    indexes: [
      {
        name: 'conversationIdIndex',
        global: true,
        hashKey: 'conversationId', // Partition key for the GSI
        rangeKey: 'userId', // Sort key for the GSI
      },
    ],
  }
)

const ConversationParticipants = dynamoose.model(
  'conversationParticipants',
  conversationParticipantsSchema
)

module.exports = ConversationParticipants
