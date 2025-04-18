const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { v4: uuidv4 } = require('uuid')

// Initialize S3 client
const s3 = new S3Client({ region: process.env.AWS_REGION })

/**
 * Generate pre-signed URLs for uploading media files
 */
exports.generatePresignedUrls = async (req, res) => {
  try {
    const { files } = req.body // Array of files with fileName and fileType

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res
        .status(400)
        .json({ error: 'Files array is required and cannot be empty' })
    }

    const bucketName = process.env.S3_BUCKET_NAME

    // Generate pre-signed URLs for each file
    const presignedUrls = await Promise.all(
      files.map(async (file) => {
        const { fileName, fileType } = file

        if (!fileName || !fileType) {
          throw new Error('Each file must have fileName and fileType')
        }

        const folder = fileType.split('/')[0] // Use the MIME type category (e.g., "image", "video")
        const key = `${folder}/${uuidv4()}_${fileName}` // Generate a unique key for the file

        // Generate a pre-signed URL for uploading
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: fileType,
          ACL: 'public-read' // Make the file publicly accessible
        })

        const url = await getSignedUrl(s3, command, { expiresIn: 3600 }) // URL expires in 1 hour

        return {
          url,
          key,
          fileName,
          fileType
        }
      })
    )

    res.status(200).json({ presignedUrls })
  } catch (error) {
    console.error('Error generating pre-signed URLs:', error)
    res.status(500).json({ error: 'Failed to generate pre-signed URLs' })
  }
}
