const Conversation = require('../models/conversationModel');
const ConversationParticipants = require('../models/conversationParticipantsModel');
const Message = require('../models/messageModel');

/**
 * Create a ONE-TO-ONE conversation
 */
exports.createOneToOneConversation = async (req, res) => {
  try {
    const { senderId, recipientId, content } = req.body;

    // Validate input
    if (!senderId || !recipientId || !content) {
      return res.status(400).json({
        error:
          'senderId, recipientId, and initial message content are required to create a conversation',
      });
    }

    // Generate participantPairKey
    const sortedIds = [senderId, recipientId].sort();
    const participantPairKey = `${sortedIds[0]}#${sortedIds[1]}`;

    // Check if the conversation already exists
    const existingConversation = await Conversation.query('participantPairKey')
      .eq(participantPairKey)
      .exec();

    console.log(existingConversation);



    let savedConversation, savedMessage;

    if (existingConversation.length > 0) {
      savedConversation = existingConversation[0];

      // Create a new message in the existing conversation
      const newMessage = new Message({
        conversationId: savedConversation.conversationId,
        senderId,
        recipientId,
        type: 'TEXT',
        content,
      });

      savedMessage = await newMessage.save();

      // Update the conversation's last message info
      await Conversation.update(
        { conversationId: savedConversation.conversationId },
        {
          lastMessageText: content,
          lastMessageAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );
    } else {
      // Create the new conversation
      const timestamp = new Date().toISOString();
      const newConversation = new Conversation({
        type: 'ONE-TO-ONE',
        participantPairKey,
        lastMessageText: content,
        lastMessageAt: timestamp,
      });

      savedConversation = await newConversation.save();

      // Add participants to the ConversationParticipants table
      const participants = [
        {
          userId: senderId,
          conversationId: savedConversation.conversationId,
          lastMessageAt: timestamp,
        },
        {
          userId: recipientId,
          conversationId: savedConversation.conversationId,
          lastMessageAt: timestamp,
        },
      ];

      await Promise.all(
        participants.map((participant) =>
          ConversationParticipants.create(participant)
        )
      );

      // Create the initial message in the Messages table
      const newMessage = new Message({
        conversationId: savedConversation.conversationId,
        senderId,
        recipientId,
        type: 'TEXT',
        content,
      });

      savedMessage = await newMessage.save();
    }

    // Emit socket event if Socket.IO is available
    const io = req.app.get('io');
    if (io) {
      // Notify recipient of new conversation/message
      io.to(savedConversation.conversationId).emit('new_message', savedMessage);
    }

    // Return the full conversation details along with the message
    res.status(201).json({
      conversation: savedConversation,
      message: savedMessage,
    });
  } catch (error) {
    console.error('Error creating one-to-one conversation:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create a GROUP conversation
 */
exports.createGroupConversation = async (req, res) => {
  try {
    const { creatorId, groupName, groupImage, participantIds } = req.body;

    // Validate input
    if (!creatorId || !participantIds || !Array.isArray(participantIds)) {
      return res
        .status(400)
        .json({ error: 'creatorId and participantIds array are required for GROUP conversations' });
    }

    // Create the conversation
    const newConversation = new Conversation({
      type: 'GROUP',
      groupName: groupName || 'Unnamed Group',
      groupImage: groupImage || 'default-group-image.png',
      creatorId,
    });

    const savedConversation = await newConversation.save();

    // Create timestamp for consistency
    const timestamp = new Date().toISOString();

    // Add all participants (including creator) to the ConversationParticipants table
    const participants = [
      // Creator with admin privileges
      {
        userId: creatorId,
        conversationId: savedConversation.conversationId,
        isAdmin: true,
        lastMessageAt: timestamp,
      },
      // Other participants without admin privileges
      ...participantIds
        .filter(id => id !== creatorId) // Exclude creator to avoid duplication
        .map(userId => ({
          userId,
          conversationId: savedConversation.conversationId,
          isAdmin: false,
          lastMessageAt: timestamp,
        }))
    ];

    await Promise.all(
      participants.map((participant) =>
        ConversationParticipants.create(participant)
      )
    );

    // Emit socket event if Socket.IO is available
    const io = req.app.get('io');
    if (io) {
      // Notify all participants about the new group conversation
      participants.forEach(participant => {
        io.to(participant.userId).emit('new_conversation', savedConversation);
      });
    }

    res.status(201).json(savedConversation);
  } catch (error) {
    console.error('Error creating group conversation:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get a specific conversation by ID
 */
exports.getConversationById = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.get(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get participants
    const participants = await ConversationParticipants.query('conversationId')
      .eq(conversationId)
      .exec();

    // Get last 20 messages
    const messages = await Message.query('conversationId')
      .eq(conversationId)
      .sort('descending')
      .limit(20)
      .exec();

    // Sort messages in ascending order
    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    res.status(200).json({
      conversation,
      participants,
      messages,
    });
  } catch (error) {
    console.error('Error getting conversation by ID:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get all conversations for a user
 */
exports.getConversationsForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit, lastEvaluatedKey } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const pageSize = parseInt(limit, 10) || 10;

    // Step 1: Fetch all conversationParticipants for the user
    let participantRecords = [];
    let lastKey;

    do {
      const result = await ConversationParticipants.query('userId')
        .eq(userId)
        .startAt(lastKey)
        .exec();

      participantRecords = participantRecords.concat(result);
      lastKey = result.lastKey;
    } while (lastKey);

    if (participantRecords.length === 0) {
      return res.status(200).json({
        conversations: [],
        lastEvaluatedKey: null,
      });
    }

    // Step 2: Extract conversationIds
    const conversationIds = participantRecords.map(
      (record) => record.conversationId
    );

    // Step 3: Fetch conversations from the conversations table
    const conversationPromises = conversationIds.map((conversationId) =>
      Conversation.get(conversationId)
    );
    const conversations = await Promise.all(conversationPromises);

    // Step 4: Sort conversations by lastMessageAt in descending order
    const sortedConversations = conversations
      .filter((conversation) => conversation) // Filter out null results (if any)
      .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    // Step 5: Apply pagination at the application level
    const startIndex = lastEvaluatedKey ? parseInt(lastEvaluatedKey, 10) : 0;
    const paginatedConversations = sortedConversations.slice(
      startIndex,
      startIndex + pageSize
    );

    // Step 6: Generate the next page token
    const nextPageToken =
      startIndex + pageSize < sortedConversations.length
        ? (startIndex + pageSize).toString()
        : null;

    // Step 7: Return the results
    res.status(200).json({
      conversations: paginatedConversations,
      lastEvaluatedKey: nextPageToken,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Send a message to a conversation
 */
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, senderId, content, type = 'TEXT' } = req.body;

    // Validate input
    if (!conversationId || !senderId || !content) {
      return res.status(400).json({
        error: 'conversationId, senderId, and content are required'
      });
    }

    // Check if user is a participant
    const isParticipant = await ConversationParticipants.get({
      userId: senderId,
      conversationId
    });

    if (!isParticipant) {
      return res.status(403).json({
        error: 'User is not a participant in this conversation'
      });
    }

    // Create the message
    const newMessage = new Message({
      conversationId,
      senderId,
      type,
      content,
    });

    const savedMessage = await newMessage.save();

    // Update conversation last message info
    const timestamp = new Date().toISOString();
    await Conversation.update(
      { conversationId },
      {
        lastMessageText: content,
        lastMessageAt: timestamp,
        updatedAt: timestamp,
      }
    );

    // Update lastMessageAt for all participants
    const participants = await ConversationParticipants.query('conversationId')
      .eq(conversationId)
      .exec();

    await Promise.all(
      participants.map(participant =>
        ConversationParticipants.update(
          {
            userId: participant.userId,
            conversationId,
          },
          {
            lastMessageAt: timestamp,
          }
        )
      )
    );

    // Emit socket event if Socket.IO is available
    const io = req.app.get('io');
    if (io) {
      io.to(conversationId).emit('new_message', savedMessage);
    }

    res.status(201).json(savedMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
};
