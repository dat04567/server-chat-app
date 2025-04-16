const express = require('express');
const router = express.Router();
const userRoutes = require('./userRoutes');
const authRoutes = require('./authRoutes');

const messageRoutes = require('./messageRoutes');
const conversationRoutes = require('./conversationRoutes');

// Mount route groups
router.use('/users', userRoutes);
router.use('/auth', authRoutes);

// Conversation-related routes
router.use('/conversations', conversationRoutes);

// Mount message routes directly at root level since they already include the full path
router.use('/', messageRoutes);

module.exports = router;
