#!/bin/bash

# Kubernetes Deployment Script for Audiobook Application
# Usage: ./deploy.sh [environment] [action]
# Environment: dev, staging, prod (default: prod)
# Action: deploy, delete, status, logs (default: deploy)

set -e

# Configuration
ENVIRONMENT=${1:-prod}
ACTION=${2:-deploy}
NAMESPACE="audiobook"

if [ "$ENVIRONMENT" != "prod" ]; then
    NAMESPACE="audiobook-$ENVIRONMENT"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        error "kubectl is not installed. Please install kubectl first."
        exit 1
    fi
    
    # Check if kubectl can connect to cluster
    if ! kubectl cluster-info &> /dev/null; then
        error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
        exit 1
    fi
    
    # Check if helm is installed (optional)
    if command -v helm &> /dev/null; then
        log "Helm is available for advanced deployments"
    else
        warning "Helm is not installed. Some features may be limited."
    fi
    
    success "Prerequisites check passed"
}

# Create namespace if it doesn't exist
create_namespace() {
    log "Creating namespace: $NAMESPACE"
    
    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        warning "Namespace $NAMESPACE already exists"
    else
        kubectl create namespace "$NAMESPACE"
        kubectl label namespace "$NAMESPACE" environment="$ENVIRONMENT"
        success "Created namespace: $NAMESPACE"
    fi
}

# Deploy secrets (with warning about production)
deploy_secrets() {
    log "Deploying secrets..."
    
    if [ "$ENVIRONMENT" = "prod" ]; then
        warning "PRODUCTION DEPLOYMENT DETECTED!"
        warning "Make sure to update secrets.yaml with actual production values:"
        warning "- Change default passwords"
        warning "- Use real SSL certificates"
        warning "- Update JWT secrets"
        echo ""
        read -p "Continue with deployment? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "Deployment cancelled"
            exit 1
        fi
    fi
    
    kubectl apply -f secrets.yaml -n "$NAMESPACE"
    success "Secrets deployed"
}

# Deploy storage
deploy_storage() {
    log "Deploying storage components..."
    kubectl apply -f storage.yaml -n "$NAMESPACE"
    
    # Wait for PVCs to be bound
    log "Waiting for persistent volume claims to be bound..."
    kubectl wait --for=condition=Bound pvc --all -n "$NAMESPACE" --timeout=300s
    success "Storage components deployed"
}

# Deploy database components
deploy_database() {
    log "Deploying database components..."
    kubectl apply -f configmap.yaml -n "$NAMESPACE"
    kubectl apply -f postgres.yaml -n "$NAMESPACE"
    kubectl apply -f redis.yaml -n "$NAMESPACE"
    
    # Wait for databases to be ready
    log "Waiting for database components to be ready..."
    kubectl wait --for=condition=Available deployment/postgres -n "$NAMESPACE" --timeout=300s
    kubectl wait --for=condition=Available deployment/redis -n "$NAMESPACE" --timeout=300s
    success "Database components deployed and ready"
}

# Deploy application services
deploy_application() {
    log "Deploying application services..."
    kubectl apply -f backend.yaml -n "$NAMESPACE"
    kubectl apply -f frontend.yaml -n "$NAMESPACE"
    kubectl apply -f microservices.yaml -n "$NAMESPACE"
    
    # Wait for core services to be ready
    log "Waiting for core application services to be ready..."
    kubectl wait --for=condition=Available deployment/backend -n "$NAMESPACE" --timeout=600s
    kubectl wait --for=condition=Available deployment/frontend -n "$NAMESPACE" --timeout=600s
    kubectl wait --for=condition=Available deployment/auth-service -n "$NAMESPACE" --timeout=300s
    success "Application services deployed and ready"
}

# Deploy ingress and load balancer
deploy_ingress() {
    log "Deploying ingress and load balancer..."
    kubectl apply -f nginx.yaml -n "$NAMESPACE"
    
    # Wait for nginx to be ready
    kubectl wait --for=condition=Available deployment/nginx -n "$NAMESPACE" --timeout=300s
    success "Ingress and load balancer deployed"
}

# Deploy monitoring (optional)
deploy_monitoring() {
    log "Deploying monitoring stack..."
    kubectl apply -f monitoring.yaml -n "$NAMESPACE"
    
    log "Waiting for monitoring components..."
    kubectl wait --for=condition=Available deployment/prometheus -n "$NAMESPACE" --timeout=300s || warning "Prometheus deployment timeout"
    kubectl wait --for=condition=Available deployment/grafana -n "$NAMESPACE" --timeout=300s || warning "Grafana deployment timeout"
    success "Monitoring stack deployed"
}

# Deploy logging (optional)
deploy_logging() {
    log "Deploying logging stack..."
    kubectl apply -f logging.yaml -n "$NAMESPACE"
    
    log "Waiting for logging components..."
    kubectl wait --for=condition=Ready statefulset/elasticsearch -n "$NAMESPACE" --timeout=600s || warning "Elasticsearch deployment timeout"
    kubectl wait --for=condition=Available deployment/kibana -n "$NAMESPACE" --timeout=300s || warning "Kibana deployment timeout"
    success "Logging stack deployed"
}

# Full deployment
deploy_all() {
    log "Starting full deployment to environment: $ENVIRONMENT"
    
    check_prerequisites
    create_namespace
    deploy_secrets
    deploy_storage
    deploy_database
    deploy_application
    deploy_ingress
    
    if [ "$ENVIRONMENT" = "prod" ]; then
        log "Deploying monitoring and logging for production..."
        deploy_monitoring
        deploy_logging
    else
        log "Skipping monitoring and logging for non-production environment"
        log "To deploy monitoring: kubectl apply -f monitoring.yaml -n $NAMESPACE"
        log "To deploy logging: kubectl apply -f logging.yaml -n $NAMESPACE"
    fi
    
    success "Deployment completed successfully!"
    
    # Show status
    show_status
}

# Delete deployment
delete_all() {
    warning "This will delete the entire audiobook application from namespace: $NAMESPACE"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Deletion cancelled"
        exit 0
    fi
    
    log "Deleting audiobook application..."
    
    # Delete in reverse order
    kubectl delete -f logging.yaml -n "$NAMESPACE" --ignore-not-found=true
    kubectl delete -f monitoring.yaml -n "$NAMESPACE" --ignore-not-found=true
    kubectl delete -f nginx.yaml -n "$NAMESPACE" --ignore-not-found=true
    kubectl delete -f microservices.yaml -n "$NAMESPACE" --ignore-not-found=true
    kubectl delete -f frontend.yaml -n "$NAMESPACE" --ignore-not-found=true
    kubectl delete -f backend.yaml -n "$NAMESPACE" --ignore-not-found=true
    kubectl delete -f postgres.yaml -n "$NAMESPACE" --ignore-not-found=true
    kubectl delete -f redis.yaml -n "$NAMESPACE" --ignore-not-found=true
    kubectl delete -f configmap.yaml -n "$NAMESPACE" --ignore-not-found=true
    kubectl delete -f storage.yaml -n "$NAMESPACE" --ignore-not-found=true
    kubectl delete -f secrets.yaml -n "$NAMESPACE" --ignore-not-found=true
    
    # Optionally delete namespace
    read -p "Delete namespace $NAMESPACE? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl delete namespace "$NAMESPACE"
        success "Namespace $NAMESPACE deleted"
    fi
    
    success "Audiobook application deleted"
}

# Show deployment status
show_status() {
    log "Audiobook Application Status - Environment: $ENVIRONMENT"
    echo ""
    
    # Namespace info
    echo "Namespace:"
    kubectl get namespace "$NAMESPACE" 2>/dev/null || echo "Namespace not found"
    echo ""
    
    # Pods status
    echo "Pods:"
    kubectl get pods -n "$NAMESPACE" -o wide 2>/dev/null || echo "No pods found"
    echo ""
    
    # Services status
    echo "Services:"
    kubectl get services -n "$NAMESPACE" 2>/dev/null || echo "No services found"
    echo ""
    
    # Ingress status
    echo "Ingress:"
    kubectl get ingress -n "$NAMESPACE" 2>/dev/null || echo "No ingress found"
    echo ""
    
    # PVC status
    echo "Persistent Volume Claims:"
    kubectl get pvc -n "$NAMESPACE" 2>/dev/null || echo "No PVCs found"
    echo ""
    
    # Get external IP if available
    EXTERNAL_IP=$(kubectl get service nginx-service -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
    if [ -n "$EXTERNAL_IP" ]; then
        success "Application is accessible at: http://$EXTERNAL_IP"
    else
        warning "External IP not yet assigned. Check service status:"
        kubectl get service nginx-service -n "$NAMESPACE" 2>/dev/null || echo "Nginx service not found"
    fi
}

# Show logs for a specific service
show_logs() {
    local service=${3:-backend}
    log "Showing logs for service: $service"
    kubectl logs -f deployment/"$service" -n "$NAMESPACE"
}

# Main script logic
case $ACTION in
    deploy)
        deploy_all
        ;;
    delete)
        delete_all
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$@"
        ;;
    secrets)
        deploy_secrets
        ;;
    storage)
        deploy_storage
        ;;
    database)
        deploy_database
        ;;
    app)
        deploy_application
        ;;
    monitoring)
        deploy_monitoring
        ;;
    logging)
        deploy_logging
        ;;
    *)
        echo "Usage: $0 [environment] [action]"
        echo ""
        echo "Environment: dev, staging, prod (default: prod)"
        echo "Actions:"
        echo "  deploy     - Deploy entire application (default)"
        echo "  delete     - Delete entire application"
        echo "  status     - Show deployment status"
        echo "  logs       - Show logs for a service"
        echo "  secrets    - Deploy only secrets"
        echo "  storage    - Deploy only storage"
        echo "  database   - Deploy only database"
        echo "  app        - Deploy only application services"
        echo "  monitoring - Deploy only monitoring"
        echo "  logging    - Deploy only logging"
        echo ""
        echo "Examples:"
        echo "  $0 prod deploy"
        echo "  $0 staging status"
        echo "  $0 dev logs backend"
        exit 1
        ;;
esac