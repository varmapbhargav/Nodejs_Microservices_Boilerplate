# Development Guide

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- Docker & Docker Compose
- Git
- VS Code (recommended)

### Setup Process

1. **Clone Repository**
```bash
git clone <repository-url>
cd Nodejs_Microservices_Boilerplate
```

2. **Install Dependencies**
```bash
# Install root dependencies
npm install

# Install all workspace dependencies
npm run install:all
```

3. **Environment Setup**
```bash
# Copy environment templates
cp .env.example .env
cp services/*/env.example services/*/.env

# Edit environment variables
# Configure database URLs, JWT secrets, etc.
```

4. **Start Infrastructure**
```bash
# Start required services
docker-compose up -d redis postgres kafka zookeeper

# Wait for services to be ready
docker-compose logs -f postgres
```

5. **Build Services**
```bash
# Build all packages and services
npm run build

# Or build individual service
npm run build:auth-service
```

6. **Start Development**
```bash
# Start all services in development mode
npm run dev

# Or start individual service
npm run dev:auth-service
```

## 🛠️ Development Workflow

### Service Development
1. **Create Feature Branch**
```bash
git checkout -b feature/new-feature
```

2. **Make Changes**
- Edit service code in `services/service-name/src/`
- Update contracts in `packages/shared-*` if needed
- Add tests alongside implementation

3. **Run Tests**
```bash
# Run all tests
npm test

# Run specific service tests
npm test --workspace=@platform/auth-service

# Run with coverage
npm run test:coverage
```

4. **Lint and Format**
```bash
# Lint all code
npm run lint

# Format all code
npm run format

# Type check
npm run type-check
```

5. **Commit Changes**
```bash
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature
```

### Package Development

#### Shared Contracts
```bash
cd packages/shared-contracts
npm run dev  # Watch mode
npm run build  # Build for consumption
npm run test  # Run tests
```

#### Shared Events
```bash
cd packages/shared-events
npm run dev
npm run build
npm run test
```

#### Observability
```bash
cd packages/observability
npm run dev
npm run build
npm run test
```

## 🐳 Local Development with Docker

### Development Mode
```bash
# Start with hot reload
docker-compose -f docker-compose.dev.yml up

# View logs
docker-compose logs -f api-gateway
```

### Production Mode
```bash
# Build and start production containers
docker-compose up -d --build

# Scale specific service
docker-compose up -d --scale auth-service=3
```

### Debugging
```bash
# Attach debugger to service
docker-compose exec auth-service npm run debug

# View container logs
docker-compose logs -f --tail=100 auth-service
```

## 🧪 Testing Strategy

### Unit Tests
```bash
# Run all unit tests
npm run test:unit

# Run specific test file
npm test -- services/auth-service/src/__tests__/auth.test.ts

# Run in watch mode
npm run test:watch
```

### Integration Tests
```bash
# Run integration tests
npm run test:integration

# Run with testcontainers
npm run test:containers
```

### Contract Tests
```bash
# Run contract tests
npm run test:contract

# Generate contract tests
npm run test:contract:generate
```

### E2E Tests
```bash
# Run end-to-end tests
npm run test:e2e

# Run specific test suite
npm run test:e2e -- --grep "Authentication flow"
```

## 📊 Debugging & Monitoring

### Local Monitoring
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **MailHog**: http://localhost:8025
- **Redis Commander**: http://localhost:8081

### Service Health Checks
```bash
# Check all services
curl http://localhost:3000/health/ready

# Check specific service
curl http://localhost:3001/health/live

# View service metrics
curl http://localhost:3001/metrics
```

### Debugging Tips

#### VS Code Debug Configuration
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Auth Service",
  "program": "${workspaceFolder}/services/auth-service/src/index.ts",
  "outFiles": ["${workspaceFolder}/services/auth-service/dist/**/*.js"],
  "env": {
    "NODE_ENV": "development"
  },
  "runtimeArgs": ["-r", "ts-node/register"]
}
```

#### Common Issues
1. **Port Conflicts**: Check `docker-compose ps` and kill conflicting processes
2. **Database Connection**: Verify PostgreSQL is running and accessible
3. **Redis Connection**: Check Redis container status and network
4. **Module Resolution**: Run `npm run build` after changing shared packages

## 🔄 Code Organization

### Service Structure
```
services/service-name/
├── src/
│   ├── controllers/     # HTTP handlers
│   ├── services/        # Business logic
│   ├── repositories/    # Data access
│   ├── models/          # Domain models
│   ├── middleware/      # Express middleware
│   ├── utils/           # Utility functions
│   ├── __tests__/       # Test files
│   └── index.ts         # Entry point
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

### Package Structure
```
packages/package-name/
├── src/
│   ├── index.ts         # Main exports
│   ├── types.ts         # Type definitions
│   └── utils.ts         # Utility functions
├── dist/                # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

## 📝 Coding Standards

### TypeScript Guidelines
- Use strict mode TypeScript
- Prefer interfaces over types for object shapes
- Use explicit return types for public functions
- Avoid `any` type - use `unknown` or proper typing
- Use JSDoc comments for public APIs

### Code Style
- Follow Prettier configuration
- Use ESLint for linting rules
- Keep functions small and focused
- Use meaningful variable and function names
- Add error handling for all async operations

### Error Handling
```typescript
// Good: Specific error handling
try {
  const result = await operation();
  return result;
} catch (error) {
  if (error instanceof ValidationError) {
    throw new BadRequestError(error.message);
  }
  throw new InternalServerError('Operation failed');
}

// Bad: Generic error handling
try {
  return await operation();
} catch (error) {
  throw error; // Don't re-throw without handling
}
```

### Logging Guidelines
```typescript
// Use structured logging
logger.info({ userId, action }, 'User action completed');
logger.error({ error, userId }, 'User operation failed');

// Include correlation IDs
const correlationId = req.headers['x-correlation-id'];
const logger = Observability.withCorrelationId(correlationId, baseLogger);
```

## 🔧 Configuration Management

### Environment Variables
```bash
# Development
NODE_ENV=development
LOG_LEVEL=debug
PORT=3001

# Database
POSTGRES_URL=postgresql://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=your-encryption-key
```

### Configuration Files
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `jest.config.js` - Test configuration
- `.eslintrc.js` - Linting rules
- `.prettierrc` - Code formatting

## 🚀 Performance Optimization

### Development Performance
- Use `npm run dev` for hot reload
- Enable source maps for debugging
- Use `ts-node-dev` for faster compilation
- Limit test data for faster test runs

### Memory Management
- Monitor memory usage during development
- Use memory profiling for optimization
- Clean up resources in tests
- Avoid memory leaks in long-running processes

### Build Optimization
- Use incremental compilation
- Enable tree shaking for unused code
- Optimize Docker layer caching
- Use parallel builds for multiple services

## 🐛 Troubleshooting

### Common Development Issues

#### Module Resolution Errors
```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild packages
npm run build
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up -d postgres
```

#### Port Conflicts
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

#### Docker Issues
```bash
# Clean Docker system
docker system prune -a

# Rebuild containers
docker-compose build --no-cache

# View container logs
docker-compose logs -f service-name
```

## 📚 Learning Resources

### Recommended Reading
- [Microservices Patterns](https://microservices.io/patterns/)
- [Domain-Driven Design](https://domain-driven-design.org/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Internal Documentation
- [Architecture Guide](./ARCHITECTURE.md)
- [API Documentation](./docs/api/)
- [Deployment Guide](./docs/deployment/)
- [Security Guidelines](./docs/security/)
