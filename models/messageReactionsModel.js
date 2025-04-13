const dynamoose = require('../config/database')

const messageReactionsSchema = new dynamoose.Schema({
  // Partition Key
  messageId: {
    type: String,
    hashKey: true, // Partition key
  },
  // Sort Key
  userId: {
    type: String,
    rangeKey: true, // Sort key
  },
  reaction: {
    type: String,
    required: true, // The reaction (e.g., 👍, ❤️, 😂)
  },
  createdAt: {
    type: String,
    default: () => new Date().toISOString(), // Automatically set the creation timestamp
  },
})

const MessageReactions = dynamoose.model(
  'messageReactions',
  messageReactionsSchema
)

module.exports = MessageReactions
