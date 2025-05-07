const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { v4: uuidv4 } = require('uuid')

// Configure AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

exports.generatePresignedUrl = async (req, res) => {
  try {
    const { fileName, fileType } = req.body

    if (!fileName || !fileType) {
      return res
        .status(400)
        .json({ error: 'fileName and fileType are required' })
    }

    // Allowed MIME types for images, videos, and documents
    const allowedMimeTypes = {
      images: ['image/jpeg', 'image/png', 'image/gif'],
      videos: ['video/mp4', 'video/mpeg'],
      documents: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    }

    // Determine the folder based on the file type
    let folder
    if (allowedMimeTypes.images.includes(fileType)) {
      folder = 'images'
    } else if (allowedMimeTypes.videos.includes(fileType)) {
      folder = 'videos'
    } else if (allowedMimeTypes.documents.includes(fileType)) {
      folder = 'documents'
    } else {
      return res.status(400).json({
        error:
          'Invalid file type. Only images, videos, and documents are allowed.',
      })
    }

    // Ensure req.user exists
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ error: 'Unauthorized: User not authenticated' })
    }

    // Use the authenticated user's ID to organize files
    const userId = req.user.id
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const uniqueFileName = `${folder}/${userId}/${uuidv4()}_${sanitizedFileName}`

    // Log user activity
    console.log(
      `User ${userId} requested a pre-signed URL for ${uniqueFileName} (${fileType})`
    )

    // Create the command for the PutObject operation
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: uniqueFileName,
      ContentType: fileType,
      // ContentLength: 10 * 1024 * 1024, // Limit file size to 10 MB
    })

    // Generate a pre-signed URL
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 }) // URL expires in 5 minutes

    res.status(200).json({
      url,
      fileName: uniqueFileName,
      fileType,
      maxFileSize: 10 * 1024 * 1024, // 10 MB
    })
  } catch (error) {
    console.error('Error generating pre-signed URL:', error)
    res.status(500).json({ error: 'Failed to generate pre-signed URL' })
  }
}
