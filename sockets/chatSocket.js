// filepath: /Users/mac/Documents/CNM/server/utils/socket.js
const User = require('../models/userModel')
const Conversation = require('../models/conversationModel')
const ConversationParticipants = require('../models/conversationParticipantsModel')
const Message = require('../models/messageModel')

// Đối tượng để lưu trữ kết nối socket của mỗi user
// Thay đổi thành object chứa mảng socketIds cho mỗi userId
const userSockets = {}

module.exports = (io) => {
  // Middleware xác thực (nếu cần)
  io.use((socket, next) => {
    const userId = socket.handshake.auth.userId
    if (!userId) {
      return next(new Error('Không được xác thực'))
    }

    socket.userId = userId
    next()
  })

  io.on('connection', (socket) => {
    const userId = socket.userId
    console.log(`User connected: ${userId}`)

    // Lưu trữ kết nối socket của người dùng (hỗ trợ nhiều thiết bị)
    if (!userSockets[userId]) {
      userSockets[userId] = []
    }
    userSockets[userId].push(socket.id)

    // Cập nhật trạng thái người dùng thành trực tuyến
    updateUserStatus(userId, 'ONLINE')

    // Tham gia vào các phòng cho các cuộc trò chuyện hiện có
    joinUserConversations(socket, userId)

    // Sự kiện bắt đầu cuộc trò chuyện mới
    socket.on('start_conversation', async (data) => {
      try {
        const { recipientId, content, type } = data

        // Xử lý cuộc trò chuyện một-một
        if (type === 'ONE-TO-ONE') {
          const conversationData = await createOrGetOneToOneConversation(
            userId,
            recipientId,
            content
          )

          // Thông báo cho người khởi tạo
          socket.emit('conversation_started', conversationData)

          // Thông báo cho người nhận nếu họ đang trực tuyến
          const recipientSocketIds = userSockets[recipientId] || []
          recipientSocketIds.forEach((socketId) => {
            io.to(socketId).emit('new_conversation', conversationData)
          })

          // Thêm cả hai người dùng vào phòng cuộc trò chuyện
          socket.join(conversationData.conversation.conversationId)
          recipientSocketIds.forEach((socketId) => {
            io.sockets.sockets
              .get(socketId)
              ?.join(conversationData.conversation.conversationId)
          })
        }
        // Xử lý cuộc trò chuyện nhóm
        else if (type === 'GROUP') {
          const { groupName, participantIds } = data
          const conversationData = await createGroupConversation(
            userId,
            groupName,
            participantIds
          )

          // Thông báo cho người khởi tạo
          socket.emit('conversation_started', conversationData)

          // Thông báo cho các thành viên và thêm họ vào phòng
          for (const participantId of participantIds) {
            const participantSocketIds = userSockets[participantId] || []
            participantSocketIds.forEach((socketId) => {
              io.to(socketId).emit('new_conversation', conversationData)
              io.sockets.sockets
                .get(socketId)
                ?.join(conversationData.conversationId)
            })
          }

          // Thêm người khởi tạo vào phòng
          socket.join(conversationData.conversationId)
        }
      } catch (error) {
        socket.emit('error', { message: error.message })
      }
    })

    // Sự kiện gửi tin nhắn
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, content, type = 'TEXT' } = data

        // Kiểm tra xem người dùng có trong cuộc trò chuyện không
        const isParticipant = await isUserInConversation(userId, conversationId)
        if (!isParticipant) {
          return socket.emit('error', {
            message: 'Không có quyền gửi tin nhắn vào cuộc trò chuyện này',
          })
        }

        // Tạo tin nhắn mới
        const newMessage = await createMessage(
          conversationId,
          userId,
          content,
          type
        )

        // Cập nhật thông tin cuộc trò chuyện
        await updateConversationLastMessage(conversationId, content)

        // Gửi tin nhắn đến tất cả người tham gia trong phòng
        io.to(conversationId).emit('new_message', newMessage)
      } catch (error) {
        socket.emit('error', { message: error.message })
      }
    })

    // Sự kiện người dùng đang gõ
    socket.on('typing', (data) => {
      const { conversationId } = data
      socket.to(conversationId).emit('user_typing', { userId, conversationId })
    })

    // Sự kiện người dùng dừng gõ
    socket.on('stop_typing', (data) => {
      const { conversationId } = data
      socket
        .to(conversationId)
        .emit('user_stop_typing', { userId, conversationId })
    })

    // Sự kiện ngắt kết nối
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${userId}`)

      // Cập nhật trạng thái người dùng thành ngoại tuyến
      // Chỉ cập nhật nếu không còn thiết bị nào khác đang kết nối
      if (userSockets[userId]) {
        userSockets[userId] = userSockets[userId].filter(
          (id) => id !== socket.id
        )

        if (userSockets[userId].length === 0) {
          // Chỉ cập nhật trạng thái ngoại tuyến khi không còn thiết bị nào kết nối
          updateUserStatus(userId, 'OFFLINE')
          delete userSockets[userId]
        }
      }
    })
  })

  // Hàm hỗ trợ
  async function updateUserStatus(userId, status) {
    try {
      await User.update(
        { id: userId },
        {
          status,
          lastSeen: new Date().toISOString(),
        }
      )
    } catch (error) {
      console.error('Error updating user status:', error)
    }
  }

  async function joinUserConversations(socket, userId) {
    try {
      // Lấy tất cả các cuộc trò chuyện của người dùng
      const userConversations = await ConversationParticipants.query('userId')
        .eq(userId)
        .exec()

      // Tham gia vào tất cả các phòng cuộc trò chuyện
      for (const conv of userConversations) {
        socket.join(conv.conversationId)
      }
    } catch (error) {
      console.error('Error joining user conversations:', error)
    }
  }

  async function createOrGetOneToOneConversation(
    senderId,
    recipientId,
    initialContent
  ) {
    // Sắp xếp ID để tạo participantPairKey
    const sortedIds = [senderId, recipientId].sort()
    const participantPairKey = `${sortedIds[0]}#${sortedIds[1]}`

    // Kiểm tra xem cuộc trò chuyện đã tồn tại chưa
    const existingConversations = await Conversation.query('participantPairKey')
      .eq(participantPairKey)
      .exec()

    if (existingConversations.length > 0) {
      const existingConversation = existingConversations[0]

      // Tạo tin nhắn mới trong cuộc trò chuyện hiện có
      const newMessage = await createMessage(
        existingConversation.conversationId,
        senderId,
        initialContent,
        'TEXT',
        recipientId
      )

      // Cập nhật thông tin cuộc trò chuyện
      await updateConversationLastMessage(
        existingConversation.conversationId,
        initialContent
      )

      return {
        conversation: existingConversation,
        message: newMessage,
        isNew: false,
      }
    }

    // Tạo cuộc trò chuyện mới
    const timestamp = new Date().toISOString()
    const newConversation = new Conversation({
      type: 'ONE-TO-ONE',
      participantPairKey,
      lastMessageText: initialContent,
      lastMessageAt: timestamp,
    })

    const savedConversation = await newConversation.save()

    // Thêm người tham gia vào cuộc trò chuyện
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
    ]

    await Promise.all(
      participants.map((participant) =>
        ConversationParticipants.create(participant)
      )
    )

    // Tạo tin nhắn đầu tiên
    const newMessage = await createMessage(
      savedConversation.conversationId,
      senderId,
      initialContent,
      'TEXT',
      recipientId
    )

    return {
      conversation: savedConversation,
      message: newMessage,
      isNew: true,
    }
  }

  async function createGroupConversation(creatorId, groupName, participantIds) {
    // Tạo cuộc trò chuyện nhóm mới
    const newConversation = new Conversation({
      type: 'GROUP',
      groupName: groupName || 'Nhóm mới',
      creatorId,
    })

    const savedConversation = await newConversation.save()

    // Thêm tất cả người tham gia vào cuộc trò chuyện
    const timestamp = new Date().toISOString()
    const participants = [
      // Thêm người tạo nhóm
      {
        userId: creatorId,
        conversationId: savedConversation.conversationId,
        lastMessageAt: timestamp,
        isAdmin: true,
      },
      // Thêm các thành viên khác
      ...participantIds.map((userId) => ({
        userId,
        conversationId: savedConversation.conversationId,
        lastMessageAt: timestamp,
        isAdmin: false,
      })),
    ]

    await Promise.all(
      participants.map((participant) =>
        ConversationParticipants.create(participant)
      )
    )

    return savedConversation
  }

  async function createMessage(
    conversationId,
    senderId,
    content,
    type = 'TEXT',
    recipientId = null
  ) {
    const newMessage = new Message({
      conversationId,
      senderId,
      recipientId,
      type,
      content,
    })

    return await newMessage.save()
  }

  async function updateConversationLastMessage(conversationId, content) {
    const timestamp = new Date().toISOString()

    // Cập nhật thông tin cuộc trò chuyện
    await Conversation.update(
      { conversationId },
      {
        lastMessageText: content,
        lastMessageAt: timestamp,
        updatedAt: timestamp,
      }
    )

    // Cập nhật lastMessageAt cho tất cả người tham gia
    const participants = await ConversationParticipants.query('conversationId')
      .eq(conversationId)
      .exec()

    await Promise.all(
      participants.map((participant) =>
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
    )
  }

  async function isUserInConversation(userId, conversationId) {
    try {
      const participant = await ConversationParticipants.get({
        userId,
        conversationId,
      })

      return Boolean(participant)
    } catch (error) {
      return false
    }
  }
}
