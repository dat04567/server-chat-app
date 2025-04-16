const Conversation = require('../models/conversationModel');
const ConversationParticipants = require('../models/conversationParticipantsModel');
const Message = require('../models/messageModel');
const User = require('../models/userModel');
/**
 * Create a ONE-TO-ONE conversation
 */
exports.createOneToOneConversation = async (req, res) => {
  try {
    // Lấy senderId từ req.user thay vì từ body
    const senderId = req.user.id;
    const { recipientId, content } = req.body;

    // Validate input
    if (!recipientId || !content) {
      return res.status(400).json({
        error: 'recipientId và content là bắt buộc để tạo cuộc trò chuyện'
      });
    }

    // Generate participantPairKey
    const sortedIds = [senderId, recipientId].sort();
    const participantPairKey = `${sortedIds[0]}#${sortedIds[1]}`;

    // Check if the conversation already exists
    const existingConversation = await Conversation.query('participantPairKey')
      .eq(participantPairKey)
      .exec();

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
    // Lấy creatorId từ user đã xác thực
    const creatorId = req.user.id;
    const { groupName, groupImage, participantIds } = req.body;

    // Validate input
    if (!participantIds || !Array.isArray(participantIds)) {
      return res
        .status(400)
        .json({ error: 'Mảng participantIds là bắt buộc đối với cuộc trò chuyện nhóm' });
    }

    // Create the conversation
    const newConversation = new Conversation({
      type: 'GROUP',
      groupName: groupName || 'Nhóm không có tên',
      groupImage: groupImage || 'default-group-image.png',
      creatorId,
    });

    const savedConversation = await newConversation.save();

    // Create timestamp for consistency
    const timestamp = new Date().toISOString();

    // Đảm bảo creatorId luôn có trong danh sách thành viên
    const allParticipantIds = Array.from(new Set([creatorId, ...participantIds]));

    // Add all participants (including creator) to the ConversationParticipants table
    const participants = allParticipantIds.map(userId => ({
      userId,
      conversationId: savedConversation.conversationId,
      isAdmin: userId === creatorId, // Chỉ người tạo là admin
      lastMessageAt: timestamp,
    }));

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
    // Lấy userId từ middleware authentication thay vì từ params
    const userId = req.user.id;
    const { limit = 20, lastEvaluatedKey } = req.query;

    // Bước 1: Lấy các cuộc trò chuyện mà người dùng tham gia
    // Sử dụng truy vấn cơ bản không cần chỉ định index phức tạp
    const query = ConversationParticipants.query("userId").eq(userId);

    // Sắp xếp theo lastMessageAt (sắp xếp client-side)
    query.sort("descending");

    // Áp dụng phân trang
    if (limit) {
      query.limit(parseInt(limit));
    }

    if (lastEvaluatedKey) {
      query.startAt(JSON.parse(lastEvaluatedKey));
    }

    const userConversations = await query.exec();

    // Sắp xếp lại theo lastMessageAt sau khi lấy dữ liệu
    userConversations.sort((a, b) => {
      // Sắp xếp giảm dần (mới nhất trước)
      return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });

    if (userConversations.length === 0) {
      return res.status(200).json({
        conversations: [],
        lastEvaluatedKey: null
      });
    }

    // Bước 2: Lấy thông tin chi tiết về các cuộc trò chuyện
    const conversationIds = userConversations.map(item => item.conversationId);
    const conversations = await Conversation.batchGet(conversationIds);

    // Tạo map tra cứu cho conversations
    const conversationMap = {};
    conversations.forEach(conv => {
      conversationMap[conv.conversationId] = conv;
    });

    // Bước 3: Lấy tất cả người tham gia cho mỗi cuộc trò chuyện
    const participantsPromises = conversationIds.map(convId =>
      ConversationParticipants.query("conversationId")
        .eq(convId)
        .using("conversationIdIndex")
        .exec()
    );

    const allParticipantsResults = await Promise.all(participantsPromises);

    // Bước 4: Thu thập tất cả userIds độc nhất
    const uniqueUserIds = new Set();
    allParticipantsResults.forEach(participants => {
      participants.forEach(p => uniqueUserIds.add(p.userId));
    });

    // Bước 5: Lấy thông tin profile của tất cả người dùng trong một lần truy vấn
    const userProfiles = await User.batchGet([...uniqueUserIds]);

    // Tạo map tra cứu cho userProfiles
    const userProfileMap = {};
    userProfiles.forEach(user => {
      userProfileMap[user.id] = user;
    });

    // Bước 6: Tạo map tra cứu cho participants theo conversationId
    const participantsMap = {};
    allParticipantsResults.forEach(participants => {
      if (participants.length > 0) {
        const convId = participants[0].conversationId;
        participantsMap[convId] = participants;
      }
    });

    // Bước 7: Tạo kết quả cuối cùng
    const result = userConversations.map(participation => {
      const conversation = conversationMap[participation.conversationId];
      if (!conversation) return null;

      const participants = participantsMap[participation.conversationId] || [];
      const participantsWithProfiles = participants.map(p => {
        const user = userProfileMap[p.userId];
        return {
          userId: p.userId,
          profile: user?.profile || null,
          username: user?.username || null,
          joinedAt: p.joinedAt,
          isAdmin: p.isAdmin,
          lastReadAt: p.lastReadAt,
          isMuted: p.isMuted,
          isArchived: p.isArchived
        };
      });

      // Xác định đối tác cho cuộc trò chuyện ONE-TO-ONE
      let partner = null;
      if (conversation.type === 'ONE-TO-ONE') {
        const partnerParticipant = participants.find(p => p.userId !== userId);
        if (partnerParticipant) {
          const partnerUser = userProfileMap[partnerParticipant.userId];
          if (partnerUser) {
            partner = {
              userId: partnerUser.id,
              username: partnerUser.username,
              profile: partnerUser.profile,
              status: partnerUser.status,
              lastSeen: partnerUser.lastSeen
            };
          }
        }
      }

      return {
        conversationId: conversation.conversationId,
        type: conversation.type,
        lastMessageText: conversation.lastMessageText || "",
        lastMessageAt: conversation.lastMessageAt || participation.lastMessageAt,
        // Thông tin riêng theo loại cuộc trò chuyện
        ...(conversation.type === 'ONE-TO-ONE' && { partner }),
        ...(conversation.type === 'GROUP' && {
          groupName: conversation.groupName,
          groupImage: conversation.groupImage,
          creatorId: conversation.creatorId
        }),
        // Thông tin tham gia của người dùng hiện tại
        participantInfo: {
          joinedAt: participation.joinedAt,
          isAdmin: participation.isAdmin,
          lastReadAt: participation.lastReadAt,
          isMuted: participation.isMuted,
          isArchived: participation.isArchived
        },
        // Danh sách tất cả người tham gia
        participants: participantsWithProfiles,
      };
    }).filter(Boolean); // Loại bỏ các giá trị null

    res.status(200).json({
      conversations: result,
      lastEvaluatedKey: userConversations.lastEvaluatedKey
    });
  } catch (error) {
    console.error('Error getting conversations for user:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversations',
      message: error.message
    });
  }
};
/**
 * Send a message to a conversation
 */
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, type = 'TEXT' } = req.body;
    const senderId = req.user.id; // Lấy senderId từ middleware xác thực

    // Validate input
    if (!conversationId || !content) {
      return res.status(400).json({
        error: 'conversationId và content là bắt buộc'
      });
    }

    // Check if user is a participant
    const isParticipant = await ConversationParticipants.get({
      userId: senderId,
      conversationId
    });

    if (!isParticipant) {
      return res.status(403).json({
        error: 'Người dùng không phải là thành viên của cuộc trò chuyện này'
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
