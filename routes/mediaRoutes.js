const express = require('express')
const { generatePresignedUrls } = require('../controllers/mediaController')

const router = express.Router()

// Endpoint to generate pre-signed URLs for uploading media files
router.post('/presigned-urls', generatePresignedUrls)

module.exports = router
