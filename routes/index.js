const express = require('express')
const router = express.Router()

const userRoutes = require('./userRoutes')
const authRoutes = require('./authRoutes')
const conversationRoutes = require('./conversationRoutes')
const mediaRoutes = require('./mediaRoutes')
const friendshipRoutes = require('./friendshipRoutes')

const { authMiddleware } = require('../middleware/authMiddleware')

// Mount route groups
router.use('/users', userRoutes)
router.use('/auth', authRoutes)

// Conversation-related routes
router.use('/conversations', authMiddleware, conversationRoutes)

// Use the media routes
router.use('/media', mediaRoutes)

// Mount friendship routes
router.use('/friendships', friendshipRoutes)

module.exports = router
