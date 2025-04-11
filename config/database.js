const dynamoose = require('dynamoose');


if (process.env.NODE_ENV === 'development') {
   // Local DynamoDB configuration
   dynamoose.aws.ddb.set({
      "credentials": {
         "accessKeyId": process.env.AWS_ACCESS_KEY_ID || 'local',
         "secretAccessKey": process.env.AWS_SECRET_ACCESS_KEY || 'local'
      },
      "region": process.env.AWS_REGION || 'us-east-1'
   });
   dynamoose.aws.ddb.local(process.env.DYNAMODB_LOCAL_ENDPOINT || 'http://localhost:8000');
}

module.exports = dynamoose;