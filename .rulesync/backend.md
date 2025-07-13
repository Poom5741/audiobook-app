---
root: false
targets: ["*"]
description: "Backend development rules and API guidelines"
globs: ["src/api/**/*.ts", "src/services/**/*.ts", "src/models/**/*.ts"]
---

# Backend Development Rules

## API Design

- Follow RESTful conventions
- Use consistent HTTP status codes
- Implement proper error handling with meaningful messages
- Use API versioning when necessary

## Database

- Use proper indexing for performance
- Implement database migrations
- Follow naming conventions for tables and columns
- Use transactions for data consistency

## Security

- Validate all input data
- Use proper authentication and authorization
- Implement rate limiting
- Sanitize database queries to prevent SQL injection

## Code Organization

- Use service layer pattern
- Implement proper logging
- Use environment variables for configuration
- Write comprehensive tests for business logic
