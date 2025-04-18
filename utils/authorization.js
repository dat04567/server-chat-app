const ConversationParticipants = require('../models/conversationParticipantsModel')

/**
 * Check if a user is a participant in a conversation
 * @param {string} userId - The ID of the user
 * @param {string} conversationId - The ID of the conversation
 * @returns {boolean} - True if the user is a participant, false otherwise
 */
const isUserInConversation = async (userId, conversationId) => {
  const participant = await ConversationParticipants.query('conversationId')
    .eq(conversationId)
    .where('userId')
    .eq(userId)
    .exec()

  return participant.length > 0 // Returns true if the user is a participant
}

module.exports = { isUserInConversation }
