# Deployment Guide

## 🚀 Deployment Overview

This guide covers deploying the enterprise microservices platform to various environments, from local development to production Kubernetes clusters.

## 📋 Prerequisites

### Infrastructure Requirements
- **Kubernetes 1.24+** for production deployments
- **Docker 20.10+** for container builds
- **Helm 3.0+** for package management (optional)
- **kubectl** configured for target cluster
- **Container registry** (Docker Hub, ECR, GCR, etc.)

### Environment Setup
- **DNS management** for domain configuration
- **SSL certificates** for HTTPS termination
- **Monitoring stack** (Prometheus, Grafana)
- **Logging infrastructure** (ELK stack or similar)

## 🏗️ Environment Strategy

### Environment Tiers
1. **Development** - Local development and feature testing
2. **Staging** - Pre-production testing environment
3. **Production** - Live production environment

### Configuration Management
```bash
# Environment-specific configurations
environments/
├── development/
│   ├── k8s/              # Kubernetes manifests
│   ├── helm/              # Helm values
│   └── terraform/         # Infrastructure as code
├── staging/
│   ├── k8s/
│   ├── helm/
│   └── terraform/
└── production/
    ├── k8s/
    ├── helm/
    └── terraform/
```

## 🐳 Container Registry Setup

### Docker Hub
```bash
# Login to Docker Hub
docker login

# Tag images
docker tag platform/api-gateway:latest your-org/api-gateway:v1.0.0

# Push images
docker push your-org/api-gateway:v1.0.0
```

### Amazon ECR
```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Create repository
aws ecr create-repository --repository-name platform/api-gateway

# Tag and push
docker tag platform/api-gateway:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/platform/api-gateway:v1.0.0
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/platform/api-gateway:v1.0.0
```

### Google GCR
```bash
# Configure Docker for GCR
gcloud auth configure-docker gcr.io

# Tag and push
docker tag platform/api-gateway:latest gcr.io/your-project/platform/api-gateway:v1.0.0
docker push gcr.io/your-project/platform/api-gateway:v1.0.0
```

## ☸️ Kubernetes Deployment

### Namespace Creation
```bash
# Apply namespace
kubectl apply -f infra/k8s/namespace.yaml

# Verify namespace
kubectl get namespaces
```

### Infrastructure Deployment
```bash
# Deploy infrastructure components
kubectl apply -f infra/k8s/infrastructure.yaml

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n platform --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n platform --timeout=300s
```

### Service Deployment
```bash
# Deploy all services
kubectl apply -f infra/k8s/

# Check deployment status
kubectl get deployments -n platform
kubectl get pods -n platform
kubectl get services -n platform
```

### Ingress Configuration
```bash
# Deploy ingress controller (NGINX)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml

# Apply ingress rules
kubectl apply -f infra/k8s/ingress.yaml

# Verify ingress
kubectl get ingress -n platform
```

## 📦 Helm Deployment

### Helm Chart Structure
```
helm/platform/
├── Chart.yaml
├── values.yaml
├── values-dev.yaml
├── values-staging.yaml
├── values-prod.yaml
└── templates/
    ├── namespace.yaml
    ├── infrastructure/
    ├── services/
    └── ingress.yaml
```

### Chart.yaml
```yaml
apiVersion: v2
name: platform
description: Enterprise Microservices Platform
type: application
version: 1.0.0
appVersion: "1.0.0"
dependencies:
  - name: postgresql
    version: 12.x.x
    repository: https://charts.bitnami.com/bitnami
  - name: redis
    version: 17.x.x
    repository: https://charts.bitnami.com/bitnami
```

### Values.yaml
```yaml
global:
  imageRegistry: your-registry.com
  imageTag: "v1.0.0"
  environment: production

infrastructure:
  postgresql:
    enabled: true
    auth:
      postgresPassword: "secure-password"
      database: "platform"
    primary:
      persistence:
        enabled: true
        size: 100Gi
  
  redis:
    enabled: true
    auth:
      enabled: true
      password: "redis-password"

services:
  apiGateway:
    enabled: true
    replicaCount: 3
    resources:
      requests:
        memory: "128Mi"
        cpu: "100m"
      limits:
        memory: "512Mi"
        cpu: "500m"
  
  authService:
    enabled: true
    replicaCount: 2
    env:
      JWT_SECRET: "your-jwt-secret"
  
  # ... other services

ingress:
  enabled: true
  className: nginx
  host: api.platform.com
  tls:
    enabled: true
    secretName: platform-tls
```

### Deployment Commands
```bash
# Install chart
helm install platform ./helm/platform -f ./helm/platform/values-prod.yaml

# Upgrade chart
helm upgrade platform ./helm/platform -f ./helm/platform/values-prod.yaml

# Uninstall chart
helm uninstall platform
```

## 🔧 Configuration Management

### Secrets Management
```bash
# Create secrets from files
kubectl create secret generic jwt-secret --from-file=jwt-secret=./secrets/jwt.txt -n platform

# Create secrets from literals
kubectl create secret generic db-credentials --from-literal=username=platform --from-literal=password=secure-pass -n platform

# Create TLS secret
kubectl create secret tls platform-tls --cert=./certs/tls.crt --key=./certs/tls.key -n platform
```

### ConfigMaps
```bash
# Create configmap from file
kubectl create configmap app-config --from-file=./config/app.yaml -n platform

# Create configmap from literals
kubectl create configmap env-config --from-literal=LOG_LEVEL=info --from-literal=NODE_ENV=production -n platform
```

### Environment Variables
```yaml
# In deployment manifests
env:
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: db-credentials
      key: url
- name: LOG_LEVEL
  valueFrom:
    configMapKeyRef:
      name: app-config
      key: log-level
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow
```yaml
name: Deploy Platform

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test
      - run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker images
        run: |
          docker build -t platform/api-gateway:${{ github.sha }} ./services/api-gateway
          docker build -t platform/auth-service:${{ github.sha }} ./services/auth-service
          # ... build other services
      
      - name: Push to registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker push platform/api-gateway:${{ github.sha }}
          docker push platform/auth-service:${{ github.sha }}

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to staging
        run: |
          kubectl set image deployment/api-gateway api-gateway=platform/api-gateway:${{ github.sha }} -n platform-staging
          kubectl set image deployment/auth-service auth-service=platform/auth-service:${{ github.sha }} -n platform-staging

  deploy-production:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to production
        run: |
          helm upgrade platform ./helm/platform -f ./helm/platform/values-prod.yaml --set global.imageTag=${{ github.sha }}
```

## 🔍 Monitoring & Observability

### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
            - platform
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
```

### Grafana Dashboards
```bash
# Import dashboards
kubectl create configmap grafana-dashboards --from-file=./infra/grafana/dashboards/ -n platform

# Configure Grafana
kubectl apply -f infra/grafana/grafana-config.yaml
```

### Alerting Rules
```yaml
# alerting.yml
groups:
  - name: platform.rules
    rules:
      - alert: ServiceDown
        expr: up{job="kubernetes-pods"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.service }} is down"
          description: "Service {{ $labels.service }} has been down for more than 1 minute."
      
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on {{ $labels.service }}"
          description: "Error rate is {{ $value }} errors per second."
```

## 🛡️ Security Considerations

### Network Policies
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: platform-network-policy
  namespace: platform
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            name: ingress-nginx
    - from:
      - podSelector:
          matchLabels:
            app: api-gateway
  egress:
    - to:
      - podSelector:
          matchLabels:
            app: postgres
    - to:
      - podSelector:
          matchLabels:
            app: redis
```

### Pod Security Policies
```yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: platform-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
```

### RBAC Configuration
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: platform
  name: platform-operator
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
```

## 📈 Scaling Strategies

### Horizontal Pod Autoscaling
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
  namespace: platform
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Vertical Pod Autoscaling
```bash
# Enable VPA
kubectl apply -f infra/k8s/vpa.yaml

# Check VPA recommendations
kubectl describe vpa api-gateway-vpa -n platform
```

### Cluster Autoscaling
```bash
# For cloud providers
kubectl autoscale cluster --min-nodes=3 --max-nodes=20 --nodes=3

# Or use cloud-specific autoscaling
```

## 🔄 Rolling Updates & Zero-Downtime

### Update Strategy
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 25%
      maxSurge: 25%
  template:
    spec:
      containers:
      - name: api-gateway
        image: platform/api-gateway:v1.1.0
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
```

### Canary Deployment
```bash
# Create canary deployment
kubectl apply -f infra/k8s/canary/api-gateway-canary.yaml

# Split traffic (90% stable, 10% canary)
kubectl patch service api-gateway -p '{"spec":{"selector":{"version":"stable"}}}'
# Then gradually shift traffic to canary
```

### Blue-Green Deployment
```bash
# Deploy green version
kubectl apply -f infra/k8s/green/

# Switch traffic to green
kubectl patch service api-gateway -p '{"spec":{"selector":{"version":"green"}}}'

# Verify green deployment
# If successful, clean up blue deployment
kubectl delete deployment api-gateway-blue
```

## 🧪 Testing Deployments

### Smoke Tests
```bash
# Run smoke tests after deployment
npm run test:smoke

# Or use curl
curl -f http://api.platform.com/health/ready
curl -f http://api.platform.com/api/v1/users
```

### Load Testing
```bash
# Use k6 or artillery for load testing
k6 run --vus 100 --duration 30s load-test.js

# Monitor during load test
kubectl top pods -n platform
```

### Chaos Testing
```bash
# Install chaos-mesh
kubectl apply -f https://raw.githubusercontent.com/chaos-mesh/chaos-mesh/master/install.yaml

# Inject latency
kubectl apply -f chaos/latency-experiment.yaml

# Inject pod failure
kubectl apply -f chaos/pod-failure-experiment.yaml
```

## 📊 Troubleshooting

### Common Issues
```bash
# Check pod status
kubectl get pods -n platform -o wide

# Check pod logs
kubectl logs -f deployment/api-gateway -n platform

# Check events
kubectl get events -n platform --sort-by='.lastTimestamp'

# Check resource usage
kubectl top pods -n platform

# Debug pod
kubectl exec -it deployment/api-gateway -n platform -- /bin/sh

# Port forward for local debugging
kubectl port-forward svc/api-gateway 3000:3000 -n platform
```

### Performance Issues
```bash
# Check resource limits
kubectl describe pod <pod-name> -n platform

# Check node resources
kubectl top nodes

# Check network policies
kubectl get networkpolicies -n platform

# Check ingress configuration
kubectl describe ingress platform-ingress -n platform
```

### Rollback Procedures
```bash
# Rollback deployment
kubectl rollout undo deployment/api-gateway -n platform

# Rollback to specific revision
kubectl rollout undo deployment/api-gateway --to-revision=2 -n platform

# Check rollout status
kubectl rollout status deployment/api-gateway -n platform
```

## 📚 Additional Resources

### Documentation
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)

### Tools
- **Lens**: Kubernetes IDE
- **k9s**: Terminal UI for Kubernetes
- **Stern**: Multi-pod log tailing
- **kubectx**: Context switching

### Best Practices
- Follow GitOps principles
- Use infrastructure as code
- Implement proper monitoring
- Regular security scans
- Disaster recovery planning
