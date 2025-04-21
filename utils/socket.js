const User = require('../models/userModel');
const Conversation = require('../models/conversationModel');
const ConversationParticipants = require('../models/conversationParticipantsModel');
const Message = require('../models/messageModel');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

// Đối tượng để lưu trữ kết nối socket của mỗi user
// Thay đổi thành object chứa mảng socketIds cho mỗi userId
const userSockets = {};

// Store the io instance so we can access it from other files
let io;

// Initialize socket.io
function initializeSocket(server) {
   io = socketIO(server, {
      cors: {
         origin: '*', // Replace with your client domain in production
         methods: ['GET', 'POST'],
         credentials: true
      }
   });

   // Set up socket middleware and event handlers
   setupSocketHandlers(io);

   return io;
}

// Setup socket handlers
function setupSocketHandlers(io) {
   // Middleware xác thực (nếu cần)
   io.use((socket, next) => {
      try {
         const cookieObject = socket.handshake.headers['cookie']
            ? socket.handshake.headers['cookie'].split(';').reduce((acc, cookie) => {
               const [key, value] = cookie.split('=');
               acc[key.trim()] = decodeURIComponent(value);
               return acc;
            }, {})
            : {};
         const token = cookieObject['token'] || cookieObject['access_token'] || null;

         if (!token) {
            return next(new Error('Không được xác thực - Token không tồn tại'));
         }

         // Giải mã token để lấy thông tin người dùng
         const decoded = jwt.verify(token, process.env.JWT_SECRET);

         // Gắn userId vào đối tượng socket
         socket.userId = decoded.id;
         next();
      } catch (error) {
         return next(new Error('Không được xác thực - Token không hợp lệ'));
      }
   });

   io.on('connection', (socket) => {
      const userId = socket.userId;
      console.log(`User connected: ${userId}`);

      // Lưu trữ kết nối socket của người dùng (hỗ trợ nhiều thiết bị)
      if (!userSockets[userId]) {
         userSockets[userId] = [];
      }
      userSockets[userId].push(socket.id);

      // Cập nhật trạng thái người dùng thành trực tuyến
      updateUserStatus(userId, 'ONLINE');

      // Tham gia vào các phòng cho các cuộc trò chuyện hiện có
      joinUserConversations(socket, userId);

      // Sự kiện bắt đầu cuộc trò chuyện mới
      socket.on('start_conversation', async (data) => {
         try {
            const { recipientId, content, type } = data;

            // Xử lý cuộc trò chuyện một-một
            if (type === 'ONE-TO-ONE') {
               const conversationData = await createOrGetOneToOneConversation(userId, recipientId, content);

               // Thông báo cho người khởi tạo
               socket.emit('conversation_started', conversationData);

               // Thông báo cho người nhận nếu họ đang trực tuyến
               const recipientSocketIds = userSockets[recipientId] || [];
               recipientSocketIds.forEach(socketId => {
                  io.to(socketId).emit('new_conversation', conversationData);
               });

               // Thêm cả hai người dùng vào phòng cuộc trò chuyện
               socket.join(conversationData.conversation.conversationId);
               recipientSocketIds.forEach(socketId => {
                  io.sockets.sockets.get(socketId)?.join(conversationData.conversation.conversationId);
               });
            }
            // Xử lý cuộc trò chuyện nhóm
            else if (type === 'GROUP') {
               // const { groupName, participantIds } = data;
               // const conversationData = await createGroupConversation(userId, groupName, participantIds);

               // // Thông báo cho người khởi tạo
               // socket.emit('conversation_started', conversationData);

               // // Thông báo cho các thành viên và thêm họ vào phòng
               // for (const participantId of participantIds) {
               //    const participantSocketIds = userSockets[participantId] || [];
               //    participantSocketIds.forEach(socketId => {
               //       io.to(socketId).emit('new_conversation', conversationData);
               //       io.sockets.sockets.get(socketId)?.join(conversationData.conversationId);
               //    });
               // }

               // // Thêm người khởi tạo vào phòng
               // socket.join(conversationData.conversationId);
            }
         } catch (error) {
            socket.emit('error', { message: error.message });
         }
      });

      // Sự kiện gửi tin nhắn
      socket.on('send_message', async (data) => {
         try {
            const { conversationId, content, type = 'TEXT' } = data;
            // Kiểm tra xem người dùng có trong cuộc trò chuyện không
            const isParticipant = await isUserInConversation(userId, conversationId);


            if (!isParticipant) {
               return socket.emit('error', {
                  message: 'Không có quyền gửi tin nhắn vào cuộc trò chuyện này'
               });
            }

            // Xử lý tin nhắn mới và trả về tin nhắn đã lưu
            const newMessage = await handleNewMessage(
               conversationId,
               userId,
               type,
               content
            );




            console.log(`New message sent: ${newMessage.content} in conversation ${conversationId}`);

            // Gửi tin nhắn đến tất cả người tham gia khác trong phòng
            socket.to(conversationId).emit('new_message', newMessage);
         } catch (error) {
            console.error('Error sending message:', error);


            socket.emit('error', { message: error.message });
         }
      });

      // Sự kiện người dùng đang gõ
      socket.on('typing', (data) => {
         const { conversationId } = data;
         socket.to(conversationId).emit('user_typing', { userId, conversationId });
      });

      // Sự kiện người dùng dừng gõ
      socket.on('stop_typing', (data) => {
         const { conversationId } = data;
         socket
            .to(conversationId)
            .emit('user_stop_typing', { userId, conversationId });
      });

      // Sự kiện ngắt kết nối
      socket.on('disconnect', () => {
         console.log(`User disconnected: ${userId}`);

         // Cập nhật trạng thái người dùng thành ngoại tuyến
         // Chỉ cập nhật nếu không còn thiết bị nào khác đang kết nối
         if (userSockets[userId]) {
            userSockets[userId] = userSockets[userId].filter(id => id !== socket.id);

            if (userSockets[userId].length === 0) {
               // Chỉ cập nhật trạng thái ngoại tuyến khi không còn thiết bị nào kết nối
               updateUserStatus(userId, 'OFFLINE');
               delete userSockets[userId];
            }
         }
      });
   });
}

// ----- Các hàm xử lý chat từ chatSocket.js -----

async function handleNewMessage(
   conversationId,
   senderId,
   type = 'TEXT',
   content
) {
   // Create the message
   const newMessage = new Message({
      conversationId,
      senderId,
      type,
      content
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
               conversationId: participant.conversationId
            }, // Composite key
            { lastMessageAt }
         )
      )
   );

   return savedMessage;
}


// ----- Các hàm hỗ trợ khác -----

async function updateUserStatus(userId, status) {
   try {
      await User.update({ id: userId }, {
         status,
         lastSeen: new Date().toISOString()
      });
   } catch (error) {
      console.error('Error updating user status:', error);
   }
}

async function joinUserConversations(socket, userId) {
   try {
      // Lấy tất cả các cuộc trò chuyện của người dùng
      const userConversations = await ConversationParticipants.query('userId')
         .eq(userId)
         .exec();

      // Tham gia vào tất cả các phòng cuộc trò chuyện
      for (const conv of userConversations) {
         socket.join(conv.conversationId);
      }
   } catch (error) {
      console.error('Error joining user conversations:', error);
   }
}

async function createOrGetOneToOneConversation(
   senderId,
   recipientId,
   initialContent
) {
   // Kiểm tra nếu người gửi và người nhận là cùng một người
   const isSelfConversation = senderId === recipientId;

   // Sắp xếp ID để tạo participantPairKey
   const sortedIds = [senderId, recipientId].sort();
   const participantPairKey = `${sortedIds[0]}#${sortedIds[1]}`;

   try {
      const timestamp = new Date().toISOString();
      let conversation, participants = [], isExisting = false;

      // Truy vấn cuộc trò chuyện hiện có
      const existingConversations = await Conversation.query('participantPairKey')
         .eq(participantPairKey)
         .exec();

      // Truy vấn thông tin partner trước - chỉ cần truy vấn một lần
      // Chỉ lấy các trường cần thiết từ User để giảm lượng dữ liệu
      let partnerInfo = null;
      if (!isSelfConversation) {
         try {
            // Chỉ lấy các trường cần thiết
            const partner = await User.get(senderId, {
               attributes: ['id', 'username', 'profile', 'status', 'lastSeen']
            });

            if (partner) {
               partnerInfo = {
                  userId: partner.id,
                  username: partner.username,
                  profile: partner.profile || {},
                  status: partner.status || 'OFFLINE',
                  lastSeen: partner.lastSeen
               };
            }
         } catch (error) {
            console.log('Error fetching partner info:', error);
            // Không throw lỗi, tiếp tục xử lý
         }
      }

      if (existingConversations && existingConversations.length > 0) {
         isExisting = true;
         conversation = existingConversations[0];

         // Lấy participants cho cuộc trò chuyện hiện có
         participants = await ConversationParticipants.query('conversationId')
            .using('conversationIdIndex')
            .eq(conversation.conversationId)
            .exec();

         // Tạo tin nhắn mới và cập nhật metadatas song song
         await Promise.all([
            // 1. Tạo tin nhắn mới
            createMessage(
               conversation.conversationId,
               senderId,
               initialContent,
               'TEXT',
               recipientId
            ),

            // 2. Cập nhật conversation metadata
            Conversation.update(
               { conversationId: conversation.conversationId },
               {
                  lastMessageText: initialContent,
                  lastMessageAt: timestamp,
                  updatedAt: timestamp,
               }
            ),

            // 3. Cập nhật lastMessageAt cho tất cả participants
            ...participants.map(participant =>
               ConversationParticipants.update(
                  {
                     userId: participant.userId,
                     conversationId: conversation.conversationId,
                  },
                  { lastMessageAt: timestamp }
               )
            )
         ]);
      } else {
         // Tạo cuộc trò chuyện mới
         const newConversation = {
            type: 'ONE-TO-ONE',
            participantPairKey,
            lastMessageText: initialContent,
            lastMessageAt: timestamp,
         };

         conversation = await Conversation.create(newConversation);

         // Tạo participants
         if (isSelfConversation) {
            // Nếu là tự nhắn tin với chính mình, chỉ tạo một participant
            participants = [{
               userId: senderId,
               conversationId: conversation.conversationId,
               lastMessageAt: timestamp,
            }];
         } else {
            // Trường hợp với hai người dùng khác nhau
            participants = [
               {
                  userId: senderId,
                  conversationId: conversation.conversationId,
                  lastMessageAt: timestamp,
               },
               {
                  userId: recipientId,
                  conversationId: conversation.conversationId,
                  lastMessageAt: timestamp,
               },
            ];
         }

         // Tạo participants và tin nhắn đầu tiên song song
         await Promise.all([
            ...participants.map(participant => ConversationParticipants.create(participant)),
            createMessage(
               conversation.conversationId,
               senderId,
               initialContent,
               'TEXT',
               recipientId
            )
         ]);
      }

      // Lấy thông tin của người tham gia gửi
      const senderParticipant = participants.find(p => p.userId === senderId);

      // Tạo đối tượng kết quả tối giản
      const resultData = {
         conversationId: conversation.conversationId,
         type: 'ONE-TO-ONE',
         lastMessageText: initialContent,
         lastMessageAt: timestamp,
         partner: partnerInfo
      };

      // Thêm thông tin participantInfo nếu có
      if (senderParticipant) {
         resultData.participantInfo = {
            joinedAt: senderParticipant.joinedAt || timestamp,
            lastReadAt: timestamp,
            isMuted: senderParticipant.isMuted || false,
            isArchived: senderParticipant.isArchived || false
         };
      }

      // Cache key cho lần truy vấn tiếp theo
      resultData.isNew = !isExisting;

      return resultData;
   } catch (error) {
      console.error("Error in createOrGetOneToOneConversation:", error);
      throw error;
   }
}

async function createGroupConversation(creatorId, groupName, participantIds) {
   // Tạo cuộc trò chuyện nhóm mới
   const newConversation = new Conversation({
      type: 'GROUP',
      groupName: groupName || 'Nhóm mới',
      creatorId,
   });

   const savedConversation = await newConversation.save();

   // Thêm tất cả người tham gia vào cuộc trò chuyện
   const timestamp = new Date().toISOString();
   const participants = [
      // Thêm người tạo nhóm
      {
         userId: creatorId,
         conversationId: savedConversation.conversationId,
         lastMessageAt: timestamp,
         isAdmin: true,
      },
      // Thêm các thành viên khác
      ...participantIds.map(userId => ({
         userId,
         conversationId: savedConversation.conversationId,
         lastMessageAt: timestamp,
         isAdmin: false,
      }))
   ];

   await Promise.all(
      participants.map((participant) =>
         ConversationParticipants.create(participant)
      )
   );

   return savedConversation;
}

async function createMessage(conversationId, senderId, content, type = 'TEXT', recipientId = null) {
   const newMessage = new Message({
      conversationId,
      senderId,
      recipientId,
      type,
      content,
   });

   return await newMessage.save();
}

async function updateConversationLastMessage(conversationId, content) {
   const timestamp = new Date().toISOString();

   // Cập nhật thông tin cuộc trò chuyện
   await Conversation.update(
      { conversationId },
      {
         lastMessageText: content,
         lastMessageAt: timestamp,
         updatedAt: timestamp,
      }
   );

   // Cập nhật lastMessageAt cho tất cả người tham gia
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
}

async function isUserInConversation(userId, conversationId) {
   try {
      const participant = await ConversationParticipants.get({
         userId,
         conversationId,
      });

      return Boolean(participant);
   } catch (error) {
      return false;
   }
}

// Export the io instance and userSockets for use in other files
module.exports = {
   initializeSocket,
   io: () => io, // Export as function to ensure it's initialized first
   getUserSockets: () => userSockets,
   isUserInConversation, // Export thêm các hàm hữu ích để sử dụng từ bên ngoài
   handleNewMessage
};