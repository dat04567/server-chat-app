const dynamoose = require('../config/database')

const friendshipSchema = new dynamoose.Schema({
  userId: {
    type: String,
    hashKey: true // Partition key
  },
  friendId: {
    type: String,
    rangeKey: true // Sort key
  },
  initiatorId: {
    type: String, // The user who initiated the request
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED'], // Friendship statuses
    required: true,
    index: {
      type: 'local', // Create an LSI
      name: 'StatusIndex' // Index name
    }
  },
  createdAt: {
    type: String,
    default: () => new Date().toISOString()
  },
  updatedAt: {
    type: String,
    default: () => new Date().toISOString()
  }
})

const Friendship = dynamoose.model('Friendships', friendshipSchema)

module.exports = Friendship
