# System Components

## Services

| Service       | Language | Port | Status  |
|---------------|----------|------|---------|
| API Gateway   | Go       | 8080 | Running |
| Auth Service  | Python   | 8081 | Running |
| User Service  | Node.js  | 8082 | Running |
| Billing       | Java     | 8083 | Stopped |

## Infrastructure

| Component   | Type        | Region    | Replicas |
|-------------|-------------|-----------|----------|
| PostgreSQL   | Database    | us-east-1 | 3        |
| Redis        | Cache       | us-east-1 | 2        |
| S3 Bucket    | Storage     | us-east-1 | -        |
| CloudFront   | CDN         | Global    | -        |
