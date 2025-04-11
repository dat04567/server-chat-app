const express = require('express');
const router = express.Router();
const userRoutes = require('./userRoutes');
const authRoutes = require('./authRoutes');

// Mount route groups
router.use('/users', userRoutes);
router.use('/auth', authRoutes);

module.exports = router;