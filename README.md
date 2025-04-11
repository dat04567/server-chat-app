# server-chat-app


## Environment Setup

This application requires several environment variables to be configured for proper operation. Create a `.env` file in the root directory with the following variables:

```
PORT=5000
NODE_ENV=development
AWS_REGION=ap-southeast-1

# For DynamoDB Local
DYNAMODB_LOCAL_ENDPOINT=http://localhost:8000
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Email settings
SES_EMAIL_FROM=dathtcomputer@gmail.com
```

Replace `your_access_key` and `your_secret_key` with your actual AWS credentials when using DynamoDB local or remove them if connecting to AWS DynamoDB directly.