const dynamoose = require('dynamoose')

if (process.env.NODE_ENV === 'development') {
  // Local DynamoDB configuration
  dynamoose.aws.ddb.set({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local',
    },
    region: process.env.AWS_REGION || 'us-east-1',
  })
  dynamoose.aws.ddb.local(
    process.env.DYNAMODB_LOCAL_ENDPOINT || 'http://localhost:8000'
  )
}

// Configure Dynamoose defaults
dynamoose.Table.defaults.set({
  create: true, // Create the table if it doesn't exist
  update: false, // Do not modify existing tables
  waitForActive: {
    enabled: true, // Wait for the table to become active
    check: {
      timeout: 180000, // Wait up to 3 minutes
      frequency: 1000, // Check every 1 second
    },
  },
})

module.exports = dynamoose
