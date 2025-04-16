const Conversation = require('../models/conversationModel');
const ConversationParticipants = require('../models/conversationParticipantsModel');
const Message = require('../models/messageModel');
const User = require('../models/userModel');
const { v1: uuidv1 } = require('uuid');

exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params; // Extract conversationId from req.params
    const { senderId, recipientId, content } = req.body; // Extract other fields from req.body

    // Validate input
    if (!conversationId || !senderId || !content) {
      return res
        .status(400)
        .json({ error: 'conversationId, senderId, and content are required' });
    }

    // Create the message
    const newMessage = new Message({
      conversationId,
      messageId: uuidv1(), // Generate time-based UUID
      senderId,
      recipientId,
      type: 'TEXT',
      content,
    });

    const savedMessage = await newMessage.save();

    // Update the lastMessageAt and lastMessageText in the Conversations table
    const lastMessageAt = savedMessage.createdAt;
    const lastMessageText = content;
    await Conversation.update(
      { conversationId },
      { lastMessageAt, lastMessageText }
    );

    // Use the GSI to query participants by conversationId
    const participants = await ConversationParticipants.query('conversationId')
      .using('conversationIdIndex') // Use the GSI
      .eq(conversationId)
      .exec();

    // Update the lastMessageAt for all participants
    await Promise.all(
      participants.map((participant) =>
        ConversationParticipants.update(
          {
            userId: participant.userId,
            conversationId: participant.conversationId,
          }, // Composite key
          { lastMessageAt }
        )
      )
    );

    res.status(201).json(savedMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMessagesForConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit, lastMessageId } = req.query;
    const currentUserId = req.user.id;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Check if user is a participant in this conversation - use get() for better performance than query()
    const userParticipation = await ConversationParticipants.get({
      userId: currentUserId,
      conversationId
    });

    if (!userParticipation) {
      return res.status(403).json({
        error: 'Access denied. You are not a participant in this conversation.'
      });
    }

    // Define pagination parameters
    const pageSize = parseInt(limit, 10) || 10;

    // Start messages query and conversation lookup in parallel for better performance
    const [conversation, messagesResult] = await Promise.all([
      Conversation.get(conversationId),
      Message.query('conversationId')
        .eq(conversationId)
        .sort('descending')
        .limit(pageSize)
        .startAt(lastMessageId ? { conversationId, messageId: lastMessageId } : undefined)
        .exec()
    ]);

    const messages = messagesResult || [];

    // If there are no messages, return early with conversation details
    if (messages.length === 0) {
      // Update read status and return response
      await updateReadStatus(currentUserId, conversationId);

      return res.status(200).json({
        messages: [],
        lastEvaluatedKey: null,
        currentUserId,
        conversationType: conversation?.type || null
      });
    }

    // Extract unique sender IDs for efficient batch retrieval
    const senderIds = [...new Set(messages.map(message => message.senderId))];

    // Fetch user data in a single batch operation
    const users = await User.batchGet(senderIds);

    // Create efficient lookup map with minimal user data
    const userMap = {};
    users.forEach(user => {
      userMap[user.id] = {
        id: user.id,
        username: user.username,
        profile: {
          firstName: user.profile?.firstName || '',
          lastName: user.profile?.lastName || '',
          phone: user.profile?.phone || ''
        }
      };
    });

    // Enrich messages with minimal user data
    const enrichedMessages = messages.map(message => ({
      conversationId: message.conversationId,
      messageId: message.messageId,
      createdAt: message.createdAt,
      senderId: message.senderId,
      type: message.type,
      content: message.content,
      status: message.status,
      sender: userMap[message.senderId] || null,
      isCurrentUserSender: message.senderId === currentUserId
    }));

    // Update the read status for this user - non-blocking
    updateReadStatus(currentUserId, conversationId);

    res.status(200).json({
      messages: enrichedMessages,
      lastEvaluatedKey: messages.lastKey
        ? { messageId: messages.lastKey.messageId }
        : null,
      conversationType: conversation?.type || null
    });
  } catch (error) {
    console.error('Error retrieving messages:', error);
    res.status(500).json({ error: error.message });
  }
};

// Helper function to update read status without blocking the response
async function updateReadStatus(userId, conversationId) {
  try {
    await ConversationParticipants.update(
      {
        userId,
        conversationId
      },
      {
        lastReadAt: new Date().toISOString()
      }
    );
  } catch (error) {
    console.error('Error updating read status:', error);
    // Don't throw - this is a background operation
  }
}

exports.getMessageById = async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;

    if (!conversationId || !messageId) {
      return res
        .status(400)
        .json({ error: 'conversationId and messageId are required' });
    }

    const message = await Message.get({ conversationId, messageId });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
