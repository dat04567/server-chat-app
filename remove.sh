aws dynamodb delete-table \
  --table-name Messages \
  --endpoint-url http://localhost:8000

aws dynamodb delete-table \
  --table-name ConversationParticipants \
  --endpoint-url http://localhost:8000

aws dynamodb delete-table \
  --table-name Conversations \
  --endpoint-url http://localhost:8000