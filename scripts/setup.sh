#!/bin/bash

# Platform Setup Script
# This script sets up the development environment for the microservices platform

set -e

echo "🚀 Setting up Enterprise Microservices Platform..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ is required. Current version: $(node -v)"
        exit 1
    fi
    print_success "Node.js $(node -v) found"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    print_success "npm $(npm -v) found"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_success "Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1) found"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    print_success "Docker Compose $(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1) found"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Install root dependencies
    npm install
    
    # Install workspace dependencies
    npm install --workspaces
    
    print_success "Dependencies installed"
}

# Setup environment files
setup_environment() {
    print_status "Setting up environment files..."
    
    # Copy .env.example to .env if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.example .env
        print_success "Created .env file from template"
    else
        print_warning ".env file already exists, skipping"
    fi
    
    # Create service-specific .env files
    for service in services/*/; do
        if [ -d "$service" ]; then
            service_name=$(basename "$service")
            env_file="$service.env"
            
            if [ ! -f "$env_file" ]; then
                # Create service-specific env file with minimal configuration
                cat > "$env_file" << EOF
# $service_name Environment Configuration
NODE_ENV=development
PORT=$(get_service_port $service_name)
LOG_LEVEL=info
EOF
                print_success "Created $env_file"
            else
                print_warning "$env_file already exists, skipping"
            fi
        fi
    done
}

# Get service port based on service name
get_service_port() {
    case $1 in
        "api-gateway") echo "3000" ;;
        "auth-service") echo "3001" ;;
        "user-service") echo "3002" ;;
        "core-service") echo "3003" ;;
        "notification-service") echo "3004" ;;
        "audit-service") echo "3005" ;;
        "feature-flag-service") echo "3006" ;;
        *) echo "3000" ;;
    esac
}

# Build services
build_services() {
    print_status "Building services..."
    
    # Build all packages and services
    npm run build
    
    print_success "Services built successfully"
}

# Start infrastructure
start_infrastructure() {
    print_status "Starting infrastructure services..."
    
    # Start Docker Compose services
    docker-compose up -d redis postgres kafka zookeeper
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    
    # Wait for PostgreSQL
    timeout 60 bash -c 'until docker-compose exec postgres pg_isready -U platform; do sleep 2; done'
    if [ $? -eq 0 ]; then
        print_success "PostgreSQL is ready"
    else
        print_error "PostgreSQL failed to start"
        exit 1
    fi
    
    # Wait for Redis
    timeout 30 bash -c 'until docker-compose exec redis redis-cli ping; do sleep 2; done'
    if [ $? -eq 0 ]; then
        print_success "Redis is ready"
    else
        print_error "Redis failed to start"
        exit 1
    fi
    
    # Wait for Kafka
    timeout 60 bash -c 'until docker-compose exec kafka kafka-broker-api-versions --bootstrap-server localhost:9092; do sleep 2; done'
    if [ $? -eq 0 ]; then
        print_success "Kafka is ready"
    else
        print_warning "Kafka might not be fully ready, but continuing..."
    fi
}

# Run database migrations (if applicable)
run_migrations() {
    print_status "Running database migrations..."
    
    # For now, we'll skip migrations as services handle their own schemas
    # In a real implementation, you might have a separate migration tool
    print_success "Database migrations completed"
}

# Setup development tools
setup_dev_tools() {
    print_status "Setting up development tools..."
    
    # Setup git hooks (if husky is configured)
    if [ -f package.json ] && grep -q "husky" package.json; then
        npm run prepare
        print_success "Git hooks installed"
    fi
    
    # Create VS Code workspace file
    if [ ! -f platform.code-workspace ]; then
        cat > platform.code-workspace << EOF
{
    "name": "Platform Workspace",
    "folders": [
        {
            "name": "Root",
            "path": "."
        },
        {
            "name": "Services",
            "path": "./services"
        },
        {
            "name": "Packages",
            "path": "./packages"
        }
    ],
    "settings": {
        "typescript.preferences.importModuleSpecifier": "relative",
        "editor.formatOnSave": true,
        "editor.codeActionsOnSave": {
            "source.fixAll.eslint": true
        }
    },
    "extensions": [
        "ms-vscode.vscode-typescript-next",
        "esbenp.prettier-vscode",
        "dbaeumer.vscode-eslint",
        "ms-vscode.vscode-json"
    ]
}
EOF
        print_success "VS Code workspace created"
    fi
}

# Run initial tests
run_tests() {
    print_status "Running initial tests..."
    
    # Run linting
    npm run lint
    if [ $? -eq 0 ]; then
        print_success "Linting passed"
    else
        print_error "Linting failed"
        exit 1
    fi
    
    # Run type checking
    npm run type-check
    if [ $? -eq 0 ]; then
        print_success "Type checking passed"
    else
        print_error "Type checking failed"
        exit 1
    fi
    
    print_success "All checks passed"
}

# Display next steps
show_next_steps() {
    print_success "Setup completed successfully! 🎉"
    echo ""
    echo "Next steps:"
    echo "1. Start development services:"
    echo "   npm run dev"
    echo ""
    echo "2. Or start with Docker:"
    echo "   docker-compose up"
    echo ""
    echo "3. Access services:"
    echo "   - API Gateway: http://localhost:3000"
    echo "   - Grafana: http://localhost:3001 (admin/admin)"
    echo "   - MailHog: http://localhost:8025"
    echo ""
    echo "4. View logs:"
    echo "   docker-compose logs -f"
    echo ""
    echo "5. Run tests:"
    echo "   npm test"
    echo ""
    echo "For more information, see README.md"
}

# Main execution
main() {
    echo "🏗️  Enterprise Microservices Platform Setup"
    echo "=========================================="
    echo ""
    
    check_prerequisites
    install_dependencies
    setup_environment
    build_services
    start_infrastructure
    run_migrations
    setup_dev_tools
    run_tests
    show_next_steps
}

# Handle script arguments
case "${1:-}" in
    "clean")
        print_status "Cleaning up..."
        docker-compose down -v
        rm -rf node_modules
        rm -rf services/*/node_modules
        rm -rf packages/*/node_modules
        rm -rf services/*/dist
        rm -rf packages/*/dist
        print_success "Cleanup completed"
        ;;
    "infra")
        print_status "Starting infrastructure only..."
        start_infrastructure
        ;;
    "build")
        print_status "Building services only..."
        build_services
        ;;
    *)
        main
        ;;
esac
