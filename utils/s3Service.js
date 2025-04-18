const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { v4: uuidv4 } = require('uuid')
const path = require('path')

// Configure the S3 client
const s3 = new S3Client({ region: process.env.AWS_REGION })

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} fileName - The original file name
 * @param {string} folder - The folder in the S3 bucket
 * @returns {string} - The URL of the uploaded file
 */
const uploadFileToS3 = async (fileBuffer, fileName, folder) => {
  const fileExtension = path.extname(fileName)
  const s3Key = `${folder}/${uuidv4()}${fileExtension}` // Unique file name in S3

  const params = {
    Bucket: process.env.S3_BUCKET_NAME, // S3 bucket name
    Key: s3Key, // S3 object key
    Body: fileBuffer, // File content
    ContentType: `application/octet-stream`, // Adjust based on file type
    ACL: 'public-read' // Make the file publicly accessible
  }

  try {
    // Upload the file to S3
    const command = new PutObjectCommand(params)
    await s3.send(command)

    // Return the public URL of the uploaded file
    return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`
  } catch (error) {
    console.error('Error uploading file to S3:', error)
    throw new Error('Failed to upload file to S3')
  }
}

const uploadAttachments = async (files) => {
  return Promise.all(
    files.map(async (file) => {
      const fileBuffer = file.buffer
      const fileName = file.originalname
      const mimeType = file.mimetype
      const folder = mimeType.split('/')[0] // Use the MIME type category (e.g., "image", "video")
      const url = await uploadFileToS3(fileBuffer, fileName, folder)

      return {
        type: folder.toUpperCase(), // IMAGE, VIDEO, or FILE
        url,
        fileName,
        mimeType
      }
    })
  )
}

module.exports = { uploadFileToS3, uploadAttachments }
