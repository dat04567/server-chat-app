const dynamoose = require('../config/database');

const conversationParticipantsSchema = new dynamoose.Schema(
  {
    userId: {
      type: String,
      hashKey: true, // Partition key
      required: true,
      index: {
        name: 'userIdIndex',
        global: true,
      },
    },
    conversationId: {
      type: String,
      rangeKey: true, // Sort key
      required: true,
      index: {
        name: 'conversationIdIndex',
        global: true,
      },
    },
    lastMessageAt: {
      type: String, // Timestamp of the last message in the conversation
      required: true,
      index: {
        name: 'lastMessageAtIndex',
        global: true,
      }
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
  }
);


const ConversationParticipants = dynamoose.model(
  'ConversationParticipants',
  conversationParticipantsSchema
);

module.exports = ConversationParticipants;
