const express = require('express')
const { generatePresignedUrl } = require('../controllers/mediaController')

const router = express.Router()

/**
 * @route   POST /media/presigned-url
 * @desc    Generate a pre-signed URL for uploading media files
 * @access  Authenticated user
 * @body    { fileName: string, fileType: string }
 * @returns {
 *   url: string,          // The pre-signed URL for uploading the file
 *   fileName: string,     // The unique file name generated for the upload
 *   fileType: string,     // The type of the file (e.g., image/jpeg, video/mp4)
 *   maxFileSize: number   // The maximum allowed file size in bytes (e.g., 10 MB)
 * }
 */
router.post('/presigned-url', generatePresignedUrl)

module.exports = router
