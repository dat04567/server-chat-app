const express = require('express')
const router = express.Router()

const userRoutes = require('./userRoutes')
const authRoutes = require('./authRoutes')
const conversationRoutes = require('./conversationRoutes')

const { authMiddleware } = require('../middleware/authMiddleware')

// Mount route groups
router.use('/users', userRoutes)
router.use('/auth', authRoutes)

// Conversation-related routes
router.use('/conversations', authMiddleware, conversationRoutes)

module.exports = router
