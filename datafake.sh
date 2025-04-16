#!/bin/bash

TABLE_NAME="Users"
ENDPOINT_URL="http://localhost:8000"

create_user() {
  aws dynamodb put-item \
    --table-name "$TABLE_NAME" \
    --endpoint-url "$ENDPOINT_URL" \
    --item "{
    \"id\": {\"S\": \"$1\"},
    \"username\": {\"S\": \"$2\"},
    \"password\": {\"S\": \"\$2b\$10\$7XcMrlFbXBq6P5kxP/9HGeX4l.NS94xlXnDs3QZNKITZyyBwro0WK\"},
    \"email\": {\"S\": \"$3\"},
    \"role\": {\"S\": \"user\"},
    \"bio\": {\"S\": \"\"},
    \"isVerified\": {\"BOOL\": true},
    \"lastActive\": {\"S\": \"2025-04-16T10:00:00Z\"},
    \"profile\": {\"M\": {
      \"firstName\": {\"S\": \"$4\"},
      \"lastName\": {\"S\": \"$5\"},
      \"phone\": {\"S\": \"0123456789\"},
      \"avatar\": {\"S\": \"https://example.com/avatar.jpg\"}
    }},
    \"createAt\": {\"S\": \"2025-04-16T10:00:00Z\"},
    \"lastSeen\": {\"S\": \"2025-04-16T10:00:00Z\"},
    \"status\": {\"S\": \"OFFLINE\"},
    \"updateAt\": {\"S\": \"2025-04-16T10:00:00Z\"}
  }"
}

create_user "1" "datdev01" "dat01@example.com" "Dat" "Dev"
create_user "2" "minhtran" "minh@example.com" "Minh" "Tran"
create_user "3" "hiennguyen" "hien@example.com" "Hien" "Nguyen"
create_user "4" "anhpham" "anh@example.com" "Anh" "Pham"
create_user "5" "linhvo" "linh@example.com" "Linh" "Vo"
create_user "6" "tuanle" "tuan@example.com" "Tuan" "Le"
create_user "7" "loannguyen" "loan@example.com" "Loan" "Nguyen"
create_user "8" "khangdo" "khang@example.com" "Khang" "Do"
create_user "9" "quynhtrinh" "quynh@example.com" "Quynh" "Trinh"
create_user "10" "hoangho" "hoang@example.com" "Hoang" "Ho"

echo "✅ Đã tạo xong 10 user fake trên DynamoDB Local ($ENDPOINT_URL)"
