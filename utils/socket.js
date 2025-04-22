const jwt = require('jsonwebtoken')
const dynamoose = require('dynamoose') // Import dynamoose
const User = require('../models/userModel')
const Conversation = require('../models/conversationModel')
const ConversationParticipants = require('../models/conversationParticipantsModel')
const Message = require('../models/messageModel')
const { isUserInConversation } = require('./authorization')

// Object to store socket connections for each user (multiple devices support)
const userSockets = {}

module.exports = (io) => {
  // Authenticate Socket Connection using JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) {
      return next(new Error('Authentication error: Token not provided'))
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      // assign userId to socket
      socket.userId = decoded.id
      next()
    } catch (error) {
      next(new Error('Authentication error: Invalid token'))
    }
  })

  // io.use((socket, next) => {
  //   try {
  //     // Parse cookies from the handshake headers
  //     const cookieObject = socket.handshake.headers['cookie']
  //       ? socket.handshake.headers['cookie'].split(';').reduce((acc, cookie) => {
  //           const [key, value] = cookie.split('=')
  //           acc[key.trim()] = decodeURIComponent(value)
  //           return acc
  //         }, {})
  //       : {}

  //     // Retrieve the token from the cookies
  //     const token = cookieObject['token'] || cookieObject['access_token'] || null

  //     if (!token) {
  //       return next(new Error('Authentication error: Token not provided in cookies'))
  //     }

  //     // Verify the token
  //     const decoded = jwt.verify(token, process.env.JWT_SECRET)

  //     // Assign userId to the socket
  //     socket.userId = decoded.id
  //     next()
  //   } catch (error) {
  //     return next(new Error('Authentication error: Invalid token'))
  //   }
  // })

  // CONNECTION
  io.on('connection', (socket) => {
    const userId = socket.userId
    console.log(`User connected : ${userId}`)

    // If the user doesn't own any socket connection yet, create an array and store the socket
    if (!userSockets[userId]) {
      userSockets[userId] = []
    }
    userSockets[userId].push(socket.id)

    // Add the user to their corresponding main room (for global updates)
    const userRoom = `user:${userId}`
    socket.join(userRoom)
    console.log(`User ${userId} joined room: ${userRoom}`)

    // Update user's activity status
    updateUserStatus(userId, 'ONLINE')

    // NEW-CONVERSATION
    socket.on('new-conversation', async ({ participantIds }) => {
      try {
        // Validate the event data
        if (!participantIds || participantIds.length === 0) {
          return socket.emit('error', {
            message: 'Invalid conversation data'
          })
        }

        console.log(`New conversation created, notifying ${participantIds.length} participants...`)

        // Notify all participants about the new conversation
        participantIds.forEach((participantId) => {
          const participantRoom = `user:${participantId}`
          io.to(participantRoom).emit('new-conversation')
        })
      } catch (error) {
        console.error('Error handling new-conversation event:', error)
        socket.emit('error', {
          message: 'Failed to notify participants about the new conversation'
        })
      }
    })

    // OPEN-CONVERSATION
    socket.on('open-conversation', async ({ conversationId }) => {
      try {
        // Check if the user is a participant in the conversation
        const isParticipant = await isUserInConversation(userId, conversationId)
        if (!isParticipant) {
          return socket.emit('error', {
            message: 'You are not authorized to join this conversation'
          })
        }

        // Join the user to the conversation-specific room
        socket.join(conversationId)
        console.log(`User ${userId} joined conversation room: ${conversationId}`)
      } catch (error) {
        console.error('Error handling open-conversation:', error)
        socket.emit('error', { message: 'Failed to join the conversation' })
      }
    })

    // SEND MESSAGE
    socket.on('send-message', async (messageObject) => {
      try {
        const { conversationId, type = 'TEXT', content } = messageObject

        // Check if the user is a participant in the conversation
        const isParticipant = await isUserInConversation(userId, conversationId)
        if (!isParticipant) {
          return socket.emit('error', {
            message: 'You are not authorized to send messages in this conversation'
          })
        }

        // Fetch the sender's details
        const sender = await User.get({ id: userId })
        if (!sender) {
          return socket.emit('error', {
            message: 'Sender not found'
          })
        }

        // Save the new message and update conversation details
        const newMessage = await handleNewMessage(conversationId, userId, type, content)

        // Add the senderName to the newMessage object
        newMessage.senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim()

        // Emit the new message to all participants in the conversation
        io.to(conversationId).emit('new-message', newMessage)

        // Emit a conversation update to all the participants in the conversation
        const lastMessageAt = newMessage.createdAt
        const lastMessageText = content
        const participants = await getParticipantsForConversation(conversationId)

        participants.forEach((participant) => {
          const participantRoom = `user:${participant.userId}`
          io.to(participantRoom).emit('conversation-update', {
            conversationId,
            lastMessageText,
            lastMessageAt
          })
        })
      } catch (error) {
        console.error('Error sending message:', error)
        socket.emit('error', { message: error.message })
      }
    })

    // CLOSE CONVERSATION
    socket.on('close-conversation', async ({ conversationId }) => {
      try {
        // Update the user's unread status and lastReadAt
        await ConversationParticipants.update(
          {
            userId,
            conversationId
          },
          {
            unread: false,
            lastReadAt: new Date().toISOString()
          }
        )
        console.log(`User ${userId} closed conversation ${conversationId}`)
      } catch (error) {
        console.error('Error updating conversation participant:', error)
        socket.emit('error', {
          message: 'Failed to update conversation status'
        })
      }
    })

    // DISCONNECT
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${userId}`)

      if (userSockets[userId]) {
        // Remove this socket from the active socket list
        userSockets[userId] = userSockets[userId].filter((id) => id !== socket.id)

        // If there isn't any socket left
        if (userSockets[userId].length === 0) {
          // delete the active socket list
          updateUserStatus(userId, 'OFFLINE')

          // update user's activity status
          delete userSockets[userId]
        }
      }
    })
  })

  // Get all participants in a conversation
  async function getParticipantsForConversation(conversationId) {
    try {
      const participants = await ConversationParticipants.query('conversationId').using('conversationIdIndex').eq(conversationId).exec()
      return participants
    } catch (error) {
      console.error('Error fetching participants for conversation:', error)
      throw new Error('Failed to fetch participants for the conversation')
    }
  }

  // Update user's activity status
  async function updateUserStatus(userId, status) {
    try {
      await User.update(
        { id: userId },
        {
          status,
          lastSeen: new Date().toISOString()
        }
      )
    } catch (error) {
      console.error('Error updating user status:', error)
    }
  }

  // Process new message
  async function handleNewMessage(conversationId, senderId, type = 'TEXT', content) {
    try {
      // Save the message to the database
      const newMessage = new Message({
        conversationId,
        senderId,
        type,
        content
      })
      const savedMessage = await newMessage.save()
      const lastMessageAt = savedMessage.createdAt
      const lastMessageText = content

      // Fetch participants for the conversation
      const participants = await getParticipantsForConversation(conversationId)

      // Debugging logs
      // console.log('Participants:', participants)
      // console.log('lastMessageAt:', lastMessageAt)
      // console.log('lastMessageText:', lastMessageText)

      if (!lastMessageAt || !lastMessageText || !participants || participants.length === 0) {
        throw new Error('Invalid data for updates: Missing required fields')
      }

      // Update conversation metadata
      const updateConversationPromise = Conversation.update(
        { conversationId },
        {
          lastMessageAt,
          lastMessageText
        }
      )

      // Update participants
      const updateParticipantsPromises = participants.map((participant) => {
        if (!participant.userId || !participant.conversationId) {
          console.error('Invalid participant data:', participant)
          return Promise.resolve() // Skip invalid participants
        }

        const updates = {
          lastMessageAt
        }

        // If the participant is not the sender and the new message is later than lastReadAt, set unread to true
        if (participant.userId !== senderId && !participant.unread && new Date(lastMessageAt) > new Date(participant.lastReadAt)) {
          updates.unread = true
        }

        return ConversationParticipants.update(
          {
            userId: participant.userId,
            conversationId: participant.conversationId
          },
          updates
        )
      })

      // Execute all updates in parallel
      await Promise.all([updateConversationPromise, ...updateParticipantsPromises])

      return savedMessage
    } catch (error) {
      console.error('Error handling new message:', error)
      throw new Error('Failed to process the new message')
    }
  }
}
