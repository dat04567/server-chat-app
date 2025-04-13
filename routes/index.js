const express = require('express')
const router = express.Router()
const userRoutes = require('./userRoutes')
const authRoutes = require('./authRoutes')

const messageRoutes = require('./messageRoutes')
const conversationRoutes = require('./conversationRoutes')

// Mount route groups
router.use('/users', userRoutes)
router.use('/auth', authRoutes)

// Message-related routes
router.use('/messages', messageRoutes)

// Conversation-related routes
router.use('/conversations', conversationRoutes)

module.exports = router
