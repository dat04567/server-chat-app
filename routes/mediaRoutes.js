const express = require('express')
const { generatePresignedUrl } = require('../controllers/mediaController')

const router = express.Router()

// Endpoint to generate pre-signed URLs for uploading media files
router.post('/presigned-url', generatePresignedUrl)

module.exports = router
