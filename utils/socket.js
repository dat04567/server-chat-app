const jwt = require('jsonwebtoken')
const dynamoose = require('dynamoose') // Import dynamoose
const User = require('../models/userModel')
const Conversation = require('../models/conversationModel')
const ConversationParticipants = require('../models/conversationParticipantsModel')
const Message = require('../models/messageModel')
const Friendship = require('../models/friendshipModel')
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
        let { conversationId, type = 'TEXT', content } = messageObject

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

        // For MEDIA messages, construct the full S3 URL and save it in content
        if (type === 'MEDIA' && content) {
          content = getMediaUrl(content)
        }

        // Save the new message and update conversation details
        const newMessage = await handleNewMessage(conversationId, userId, type, content)

        // console.log('sender:', sender)

        // Add the senderName to the newMessage object
        newMessage.senderName = `${sender.profile.firstName || ''} ${sender.profile.lastName || ''}`.trim()

        newMessage.avatar = sender.profile.avatar

        // Emit the new message to all participants in the conversation
        io.to(conversationId).emit('new-message', newMessage)

        // Emit a conversation update to all the participants in the conversation
        const lastMessageAt = newMessage.createdAt
        const lastMessageText = type === 'MEDIA' ? '[Media]' : content
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
        // Check if the participant still exists
        const participant = await ConversationParticipants.get({ userId, conversationId })
        if (!participant) {
          // User is no longer a participant, do not recreate the record!
          console.log(`User ${userId} is no longer a participant of ${conversationId}, skipping update.`)
          return
        }

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

    // UPDATE USER ROLE (promote/demote admin)
    socket.on('update-user-role', async ({ conversationId, userId: targetUserId, isAdmin }) => {
      try {
        // Check if the requester is an admin in the conversation
        const requester = await ConversationParticipants.get({ userId, conversationId })
        if (!requester || !requester.isAdmin) {
          return socket.emit('error', { message: 'Only admins can update user roles.' })
        }

        // Update the target user's isAdmin status
        await ConversationParticipants.update({ userId: targetUserId, conversationId }, { isAdmin })

        // Notify all participants in the conversation about the role change
        io.to(conversationId).emit('user-role-updated', {
          conversationId,
          userId: targetUserId,
          isAdmin
        })

        // Fetch display names for the system message
        const promoter = await User.get({ id: userId })
        const targetUser = await User.get({ id: targetUserId })
        const promoterName = promoter ? `${promoter.profile.firstName || ''} ${promoter.profile.lastName || ''}`.trim() : 'Someone'
        const targetName = targetUser ? `${targetUser.profile.firstName || ''} ${targetUser.profile.lastName || ''}`.trim() : 'a user'

        // Create a system message
        const action = isAdmin ? 'promoted' : 'demoted'
        const systemContent = `${promoterName} has ${action} ${targetName} ${isAdmin ? 'to be an admin' : 'from admin'} of this group.`
        const systemMessage = await handleNewMessage(conversationId, 'SYSTEM', 'TEXT', systemContent)

        // Emit the system message to all participants
        io.to(conversationId).emit('new-message', systemMessage)

        // Emit a conversation update to all participants
        const lastMessageAt = systemMessage.createdAt
        const lastMessageText = systemContent
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
        console.error('Error updating user role:', error)
        socket.emit('error', { message: 'Failed to update user role.' })
      }
    })

    // REMOVE USER FROM GROUP
    socket.on('remove-user-from-group', async ({ conversationId, userId: targetUserId }) => {
      try {
        // Check if the requester is an admin in the conversation
        const requester = await ConversationParticipants.get({ userId, conversationId })
        if (!requester || !requester.isAdmin) {
          return socket.emit('error', { message: 'Only admins can remove users.' })
        }

        // Remove the user from the group
        await ConversationParticipants.delete({ userId: targetUserId, conversationId })

        // Notify all participants in the conversation about the removal
        io.to(conversationId).emit('user-removed', {
          conversationId,
          userId: targetUserId,
          removerId: userId
        })

        // Fetch display names for the system message
        const remover = await User.get({ id: userId })
        const removedUser = await User.get({ id: targetUserId })
        const removerName = remover ? `${remover.profile.firstName || ''} ${remover.profile.lastName || ''}`.trim() : 'Someone'
        const removedName = removedUser ? `${removedUser.profile.firstName || ''} ${removedUser.profile.lastName || ''}`.trim() : 'a user'

        // Create a system message
        const systemContent = `${removerName} has removed ${removedName} from this group.`
        const systemMessage = await handleNewMessage(conversationId, 'SYSTEM', 'TEXT', systemContent)

        // Emit the system message to all participants
        io.to(conversationId).emit('new-message', systemMessage)

        // Emit a conversation update to all participants
        const lastMessageAt = systemMessage.createdAt
        const lastMessageText = systemContent
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
        console.error('Error removing user from group:', error)
        socket.emit('error', { message: 'Failed to remove user from group.' })
      }
    })

    // INVITE USER TO GROUP (socket-only logic)
    socket.on('invite-user-to-group', async ({ conversationId, userId: invitedUserId }) => {
      try {
        // Fetch conversation and inviter info
        const conversation = await Conversation.get({ conversationId })
        if (!conversation || conversation.type !== 'GROUP') {
          return socket.emit('error', { message: 'Invalid group conversation' })
        }

        const inviterId = socket.userId
        const inviterRecord = await ConversationParticipants.get({ userId: inviterId, conversationId })
        if (!inviterRecord) {
          return socket.emit('error', { message: 'You are not a participant in this group' })
        }

        // Check if inviter and invited user are friends (optional, based on your logic)
        const friendship = await Friendship.get({ userId: inviterId, friendId: invitedUserId })
        if (!friendship || friendship.status !== 'ACCEPTED') {
          return socket.emit('error', { message: 'You can only invite your friends to the group' })
        }

        const isAdminOrCreator = inviterRecord.isAdmin || conversation.creatorId === inviterId

        // Fetch invited user's profile (do this before both branches)
        const invitedUser = await User.get({ id: invitedUserId })

        if (isAdminOrCreator) {
          // Admins or the creator can directly add the invited user to the group
          const existingParticipant = await ConversationParticipants.get({ userId: invitedUserId, conversationId })
          if (existingParticipant) {
            return socket.emit('error', { message: 'User is already a participant in this group' })
          }

          await ConversationParticipants.create({
            userId: invitedUserId,
            conversationId,
            lastMessageAt: conversation.lastMessageAt,
            isAdmin: false,
            unread: true,
            lastReadAt: new Date().toISOString()
          })

          // Notify all participants in the conversation about the new user
          io.to(conversationId).emit('user-added', {
            conversationId,
            userId: invitedUserId,
            profile: invitedUser ? invitedUser.profile : null
          })

          // Create and emit a system message
          const adder = await User.get({ id: inviterId })
          const adderName = adder ? `${adder.profile.firstName || ''} ${adder.profile.lastName || ''}`.trim() : 'Someone'
          const joinedName = invitedUser ? `${invitedUser.profile.firstName || ''} ${invitedUser.profile.lastName || ''}`.trim() : 'A user'
          const systemContent = `${adderName} has added ${joinedName} to the group.`
          const systemMessage = await handleNewMessage(conversationId, 'SYSTEM', 'TEXT', systemContent)
          io.to(conversationId).emit('new-message', systemMessage)

          // Emit conversation-update to all participants
          const lastMessageAt = systemMessage.createdAt
          const lastMessageText = systemContent

          const participants = await getParticipantsForConversation(conversationId)
          participants.forEach((participant) => {
            const participantRoom = `user:${participant.userId}`
            io.to(participantRoom).emit('conversation-update', {
              conversationId,
              lastMessageText,
              lastMessageAt
            })
          })
        } else {
          // Non-admin members can propose the invited user for approval
          if (!conversation.pendingParticipantIds) conversation.pendingParticipantIds = []
          if (conversation.pendingParticipantIds.includes(invitedUserId)) {
            return socket.emit('error', { message: 'User is already in the pending list' })
          }
          conversation.pendingParticipantIds.push(invitedUserId)
          await Conversation.update({ conversationId }, { pendingParticipantIds: conversation.pendingParticipantIds })

          // Notify admins/creator about the pending invitation
          io.to(conversationId).emit('invited-user', {
            conversationId,
            userId: invitedUserId,
            profile: invitedUser ? invitedUser.profile : null
          })
        }
      } catch (error) {
        console.error('Error handling invite-user-to-group:', error)
        socket.emit('error', { message: 'Failed to handle user invitation.' })
      }
    })

    // APPROVE USER IN GROUP
    socket.on('approve-user-in-group', async ({ conversationId, userId: approvedUserId }) => {
      try {
        // Fetch the conversation
        const conversation = await Conversation.get({ conversationId })
        if (!conversation || conversation.type !== 'GROUP') {
          return socket.emit('error', { message: 'Invalid group conversation' })
        }

        // Check if the approver is authorized (admin or creator)
        const approverRecord = await ConversationParticipants.get({ userId, conversationId })
        if (!approverRecord || (!approverRecord.isAdmin && conversation.creatorId !== userId)) {
          return socket.emit('error', { message: 'You are not authorized to approve members in this conversation' })
        }

        // Remove the user from pendingParticipantIds
        const pendingIndex = (conversation.pendingParticipantIds || []).indexOf(approvedUserId)
        if (pendingIndex === -1) {
          return socket.emit('error', { message: 'User is not in the pending list' })
        }
        conversation.pendingParticipantIds.splice(pendingIndex, 1)
        await Conversation.update({ conversationId }, { pendingParticipantIds: conversation.pendingParticipantIds })

        // Add the user to ConversationParticipants
        await ConversationParticipants.create({
          userId: approvedUserId,
          conversationId,
          lastMessageAt: conversation.lastMessageAt,
          isAdmin: false,
          unread: true,
          lastReadAt: new Date().toISOString()
        })

        // Fetch approved user's profile
        const approvedUser = await User.get({ id: approvedUserId })

        // Notify all participants in the conversation about the approval
        io.to(conversationId).emit('approved-user', {
          conversationId,
          user: approvedUser
            ? {
                userId: approvedUserId,
                profile: approvedUser.profile
              }
            : null
        })

        // Emit user-added event
        io.to(conversationId).emit('user-added', {
          conversationId,
          userId: approvedUserId,
          profile: approvedUser ? approvedUser.profile : null
        })

        // Create and emit a system message
        const joinedName = approvedUser ? `${approvedUser.profile.firstName || ''} ${approvedUser.profile.lastName || ''}`.trim() : 'A user'
        const systemContent = `${joinedName} has joined the group.`
        const systemMessage = await handleNewMessage(conversationId, 'SYSTEM', 'TEXT', systemContent)
        io.to(conversationId).emit('new-message', systemMessage)

        // Emit conversation-update to all participants
        const lastMessageAt = systemMessage.createdAt
        const lastMessageText = systemContent

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
        console.error('Error handling approve-user-in-group:', error)
        socket.emit('error', { message: 'Failed to handle user approval.' })
      }
    })

    // REJECT USER IN GROUP
    socket.on('reject-user-in-group', async ({ conversationId, userId: rejectedUserId }) => {
      try {
        // Fetch the conversation
        const conversation = await Conversation.get({ conversationId })
        if (!conversation || conversation.type !== 'GROUP') {
          return socket.emit('error', { message: 'Invalid group conversation' })
        }

        // Check if the approver is authorized (admin or creator)
        const approverRecord = await ConversationParticipants.get({ userId, conversationId })
        if (!approverRecord || (!approverRecord.isAdmin && conversation.creatorId !== userId)) {
          return socket.emit('error', { message: 'You are not authorized to reject members in this conversation' })
        }

        // Remove the user from pendingParticipantIds
        const pendingIndex = (conversation.pendingParticipantIds || []).indexOf(rejectedUserId)
        if (pendingIndex === -1) {
          return socket.emit('error', { message: 'User is not in the pending list' })
        }
        conversation.pendingParticipantIds.splice(pendingIndex, 1)
        await Conversation.update({ conversationId }, { pendingParticipantIds: conversation.pendingParticipantIds })

        // Fetch rejected user's profile
        const rejectedUser = await User.get({ id: rejectedUserId })

        // Notify all participants in the conversation about the rejection
        io.to(conversationId).emit('rejected-user', {
          conversationId,
          user: rejectedUser
            ? {
                userId: rejectedUserId,
                profile: rejectedUser.profile
              }
            : null
        })
      } catch (error) {
        console.error('Error handling reject-user-in-group:', error)
        socket.emit('error', { message: 'Failed to handle user rejection.' })
      }
    })

    // DELETE GROUP (creator only)
    socket.on('delete-group', async ({ conversationId }) => {
      try {
        // Fetch conversation
        const conversation = await Conversation.get({ conversationId })
        if (!conversation || conversation.type !== 'GROUP') {
          return socket.emit('error', { message: 'Invalid group conversation' })
        }

        // Only the creator can delete
        if (conversation.creatorId !== userId) {
          return socket.emit('error', { message: 'Only the creator can delete this group.' })
        }

        // Set isDeleted to true
        await Conversation.update({ conversationId }, { isDeleted: true })

        // Remove all participants
        const participants = await getParticipantsForConversation(conversationId)
        const removePromises = participants.map((participant) => ConversationParticipants.delete({ userId: participant.userId, conversationId }))
        await Promise.all(removePromises)

        // Emit to all participants
        io.to(conversationId).emit('deleted-group', { conversationId })

        // Emit conversation-update to all participants
        participants.forEach((participant) => {
          const participantRoom = `user:${participant.userId}`
          io.to(participantRoom).emit('conversation-update', {
            conversationId,
            lastMessageText: '[Group deleted]',
            lastMessageAt: new Date().toISOString()
          })
        })
      } catch (error) {
        console.error('Error deleting group:', error)
        socket.emit('error', { message: 'Failed to delete group.' })
      }
    })

    // LEAVE GROUP (non-creator)
    socket.on('leave-group', async ({ conversationId }) => {
      try {
        // Fetch conversation
        const conversation = await Conversation.get({ conversationId })
        if (!conversation || conversation.type !== 'GROUP') {
          return socket.emit('error', { message: 'Invalid group conversation' })
        }

        // Creator cannot leave (must delete)
        if (conversation.creatorId === userId) {
          return socket.emit('error', { message: 'Creator cannot leave the group. Use delete instead.' })
        }

        // Remove this user from participants
        await ConversationParticipants.delete({ userId, conversationId })

        // Fetch user profile for system message
        const user = await User.get({ id: userId })
        const userName = user ? `${user.profile.firstName || ''} ${user.profile.lastName || ''}`.trim() : 'A user'

        // System message
        const systemContent = `${userName} has left the group.`
        const systemMessage = await handleNewMessage(conversationId, 'SYSTEM', 'TEXT', systemContent)
        io.to(conversationId).emit('new-message', systemMessage)

        // Emit to all participants with user data
        io.to(conversationId).emit('left-group', {
          conversationId,
          user: user
            ? {
                userId,
                profile: user.profile
              }
            : null
        })

        // Emit conversation-update to all participants
        const participants = await getParticipantsForConversation(conversationId)
        participants.forEach((participant) => {
          const participantRoom = `user:${participant.userId}`
          io.to(participantRoom).emit('conversation-update', {
            conversationId,
            lastMessageText: systemContent,
            lastMessageAt: systemMessage.createdAt
          })
        })
      } catch (error) {
        console.error('Error leaving group:', error)
        socket.emit('error', { message: 'Failed to leave group.' })
      }
    })

    // START TYPING
    socket.on('typing', ({ conversationId, userId }) => {
      // Broadcast to all other users in the conversation except the sender
      socket.to(conversationId).emit('typing', { conversationId, userId })
    })

    // STOP TYPING
    socket.on('stop-typing', ({ conversationId, userId }) => {
      socket.to(conversationId).emit('stop-typing', { conversationId, userId })
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
          lastMessageText,
          lastMessageType: type
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

  // Helper to construct S3 media URL
  function getMediaUrl(key) {
    // Replace with your actual S3 bucket URL or use an environment variable
    return `${process.env.S3_PUBLIC_URL}/${key}`
  }
}
