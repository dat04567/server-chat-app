const Conversation = require('../models/conversationModel')
const ConversationParticipants = require('../models/conversationParticipantsModel')
const Message = require('../models/messageModel')

/**
 * Create a ONE-TO-ONE conversation
 */
exports.createOneToOneConversation = async (req, res) => {
  try {
    const { senderId, recipientId, content } = req.body

    // Validate input
    if (!senderId || !recipientId || !content) {
      return res.status(400).json({
        error:
          'senderId, recipientId, and initial message content are required to create a conversation',
      })
    }

    // Generate participantPairKey
    const sortedIds = [senderId, recipientId].sort()
    const participantPairKey = `${sortedIds[0]}#${sortedIds[1]}`

    // Check if the conversation already exists
    const existingConversation = await Conversation.query('participantPairKey')
      .eq(participantPairKey)
      .exec()

    if (existingConversation.length > 0) {
      return res.status(200).json(existingConversation[0]) // Return the existing conversation
    }

    // Create the new conversation
    const newConversation = new Conversation({
      type: 'ONE-TO-ONE',
      participantPairKey,
      lastMessageText: content, // Set the initial message as the last message
      lastMessageAt: new Date().toISOString(), // Set the timestamp of the initial message
    })

    const savedConversation = await newConversation.save()

    // Add participants to the ConversationParticipants table
    const participants = [
      {
        userId: senderId,
        conversationId: savedConversation.conversationId,
        lastMessageAt: savedConversation.lastMessageAt,
      },
      {
        userId: recipientId,
        conversationId: savedConversation.conversationId,
        lastMessageAt: savedConversation.lastMessageAt,
      },
    ]

    await Promise.all(
      participants.map((participant) =>
        ConversationParticipants.create(participant)
      )
    )

    // Create the initial message in the Messages table
    const newMessage = new Message({
      conversationId: savedConversation.conversationId,
      senderId,
      recipientId,
      type: 'TEXT',
      content,
      createdAt: savedConversation.lastMessageAt,
    })

    const savedMessage = await newMessage.save()

    // Return the full conversation details along with the initial message
    res.status(201).json({
      conversation: savedConversation,
      initialMessage: savedMessage,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Create a GROUP conversation
 * also need member ids
 * incomplete
 */
exports.createGroupConversation = async (req, res) => {
  try {
    const { creatorId, groupName, groupImage } = req.body

    // Validate input
    if (!creatorId) {
      return res
        .status(400)
        .json({ error: 'creatorId is required for GROUP conversations' })
    }

    // Create the conversation
    const newConversation = new Conversation({
      type: 'GROUP',
      groupName: groupName || 'Unnamed Group', // Default group name
      groupImage: groupImage || 'default-group-image.png', // Default group image
      creatorId,
    })

    const savedConversation = await newConversation.save()

    // Add the creator as a participant in the ConversationParticipants table
    const creatorParticipant = {
      userId: creatorId,
      conversationId: savedConversation.conversationId,
      isAdmin: true, // Creator is the admin
      lastMessageAt: new Date().toISOString(),
    }

    await ConversationParticipants.create(creatorParticipant)

    res.status(201).json(savedConversation)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get a specific conversation by ID
 */
exports.getConversationById = async (req, res) => {
  try {
    const { conversationId } = req.params
    const conversation = await Conversation.get(conversationId)

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    conversation.conversationId = conversationId // Ensure conversationId is included in the response

    res.status(200).json(conversation)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

/**
 * Get all conversations for a user
 */
exports.getConversationsForUser = async (req, res) => {
  try {
    const { userId } = req.params
    const { limit, lastEvaluatedKey } = req.query

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    const pageSize = parseInt(limit, 10) || 10

    // Step 1: Fetch all conversationParticipants for the user
    let participantRecords = []
    let lastKey

    do {
      const result = await ConversationParticipants.query('userId')
        .eq(userId)
        .startAt(lastKey)
        .exec()

      participantRecords = participantRecords.concat(result)
      lastKey = result.lastKey
    } while (lastKey)

    if (participantRecords.length === 0) {
      return res.status(200).json({
        conversations: [],
        lastEvaluatedKey: null,
      })
    }

    // Step 2: Extract conversationIds
    const conversationIds = participantRecords.map(
      (record) => record.conversationId
    )

    // Step 3: Fetch conversations from the conversations table
    const conversationPromises = conversationIds.map((conversationId) =>
      Conversation.get(conversationId)
    )
    const conversations = await Promise.all(conversationPromises)

    // Step 4: Sort conversations by lastMessageAt in descending order
    const sortedConversations = conversations
      .filter((conversation) => conversation) // Filter out null results (if any)
      .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))

    // Step 5: Apply pagination at the application level
    const startIndex = lastEvaluatedKey ? parseInt(lastEvaluatedKey, 10) : 0
    const paginatedConversations = sortedConversations.slice(
      startIndex,
      startIndex + pageSize
    )

    // Step 6: Generate the next page token
    const nextPageToken =
      startIndex + pageSize < sortedConversations.length
        ? (startIndex + pageSize).toString()
        : null

    // Step 7: Return the results
    res.status(200).json({
      conversations: paginatedConversations,
      lastEvaluatedKey: nextPageToken,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
