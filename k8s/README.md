# Kubernetes Deployment Guide

This directory contains Kubernetes manifests and deployment scripts for the Audiobook Application.

## 📋 Overview

The audiobook application consists of multiple microservices deployed on Kubernetes:

- **Frontend**: Next.js React application
- **Backend**: Node.js Express API server 
- **Auth Service**: Authentication and authorization
- **Parser Service**: Book parsing (PDF, EPUB)
- **Crawler Service**: Web scraping and downloads
- **TTS Service**: Text-to-Speech generation
- **Summarizer Service**: Text summarization
- **PostgreSQL**: Primary database
- **Redis**: Caching layer
- **Nginx**: Load balancer and reverse proxy
- **ELK Stack**: Centralized logging (Elasticsearch, Logstash, Kibana)
- **Monitoring**: Prometheus and Grafana

## 🚀 Quick Start

### Prerequisites

1. **Kubernetes Cluster**: Running Kubernetes 1.20+
2. **kubectl**: Configured to access your cluster
3. **Docker Images**: Built and pushed to your registry
4. **Storage**: NFS or persistent volume provisioner
5. **Load Balancer**: Cloud provider load balancer or MetalLB

### Build and Push Images

First, build and push all Docker images:

```bash
# From the root directory
./scripts/build-images.sh
./scripts/push-images.sh
```

### Deploy Application

```bash
# Production deployment
cd k8s
./deploy.sh prod deploy

# Development deployment
./deploy.sh dev deploy

# Staging deployment
./deploy.sh staging deploy
```

## 📁 File Structure

```
k8s/
├── namespace.yaml          # Kubernetes namespaces
├── configmap.yaml         # Configuration maps
├── secrets.yaml           # Secrets (update for production!)
├── storage.yaml           # Persistent volumes and claims
├── postgres.yaml          # PostgreSQL database
├── redis.yaml             # Redis cache
├── backend.yaml           # Backend API service
├── frontend.yaml          # Frontend web application
├── microservices.yaml     # All microservices
├── nginx.yaml             # Load balancer and ingress
├── monitoring.yaml        # Prometheus and Grafana
├── logging.yaml           # ELK stack
├── deploy.sh              # Deployment script
└── README.md              # This file
```

## ⚙️ Configuration

### 1. Update Secrets (IMPORTANT!)

Before production deployment, update `secrets.yaml`:

```yaml
# Change these values for production:
DB_PASSWORD: "your-secure-password"
JWT_SECRET: "your-jwt-secret-256-bits"
JWT_REFRESH_SECRET: "your-refresh-secret-256-bits"
```

### 2. Configure Storage

Update `storage.yaml` with your storage backend:

```yaml
# For NFS storage:
nfs:
  server: your-nfs-server.com
  path: /data/audiobook

# For cloud storage, use appropriate StorageClass
```

### 3. Configure Domain

Update `nginx.yaml` ingress configuration:

```yaml
# Change to your domain:
- host: audiobook.example.com
```

### 4. Configure SSL Certificates

For production, add real SSL certificates to `secrets.yaml`:

```bash
# Generate base64 encoded certificates:
cat your-cert.crt | base64 -w 0
cat your-private.key | base64 -w 0
```

## 🔧 Deployment Commands

### Full Deployment

```bash
# Deploy everything to production
./deploy.sh prod deploy

# Deploy to development environment
./deploy.sh dev deploy
```

### Partial Deployments

```bash
# Deploy only database components
./deploy.sh prod database

# Deploy only application services
./deploy.sh prod app

# Deploy only monitoring
./deploy.sh prod monitoring

# Deploy only logging
./deploy.sh prod logging
```

### Management Commands

```bash
# Check deployment status
./deploy.sh prod status

# View logs for a service
./deploy.sh prod logs backend
./deploy.sh prod logs frontend

# Delete entire deployment
./deploy.sh prod delete
```

## 📊 Monitoring and Logging

### Accessing Monitoring Dashboards

1. **Grafana Dashboard**:
   ```bash
   kubectl port-forward service/grafana-service 3000:3000 -n audiobook
   # Access: http://localhost:3000 (admin/admin123)
   ```

2. **Prometheus Metrics**:
   ```bash
   kubectl port-forward service/prometheus-service 9090:9090 -n audiobook
   # Access: http://localhost:9090
   ```

### Accessing Logs

1. **Kibana Dashboard**:
   ```bash
   kubectl port-forward service/kibana-service 5601:5601 -n audiobook
   # Access: http://localhost:5601
   ```

2. **Direct Log Access**:
   ```bash
   # View logs for specific service
   kubectl logs -f deployment/backend -n audiobook
   
   # View logs for all pods with label
   kubectl logs -f -l app=audiobook -n audiobook
   ```

## 🔍 Troubleshooting

### Common Issues

1. **Pods not starting**:
   ```bash
   kubectl describe pod <pod-name> -n audiobook
   kubectl logs <pod-name> -n audiobook
   ```

2. **PVC not binding**:
   ```bash
   kubectl get pv,pvc -n audiobook
   kubectl describe pvc <pvc-name> -n audiobook
   ```

3. **Service not accessible**:
   ```bash
   kubectl get svc -n audiobook
   kubectl describe svc <service-name> -n audiobook
   ```

4. **Database connection issues**:
   ```bash
   # Test database connectivity
   kubectl exec -it deployment/backend -n audiobook -- nc -zv postgres-service 5432
   ```

### Health Checks

All services include health check endpoints:

```bash
# Check service health
kubectl exec -it deployment/backend -n audiobook -- curl http://localhost:5000/health
kubectl exec -it deployment/frontend -n audiobook -- curl http://localhost:3000
```

### Scaling Services

```bash
# Scale backend service
kubectl scale deployment backend --replicas=5 -n audiobook

# Scale TTS service for high load
kubectl scale deployment tts-service --replicas=3 -n audiobook
```

## 🔐 Security Considerations

### Production Security Checklist

- [ ] Update all default passwords in `secrets.yaml`
- [ ] Use real SSL certificates
- [ ] Configure network policies
- [ ] Enable RBAC
- [ ] Use private container registry
- [ ] Configure secrets encryption at rest
- [ ] Enable audit logging
- [ ] Configure pod security policies
- [ ] Use non-root containers
- [ ] Regularly update base images

### Network Policies

Apply network policies to restrict pod-to-pod communication:

```bash
kubectl apply -f network-policies.yaml -n audiobook
```

## 📈 Performance Optimization

### Resource Limits

Adjust resource requests and limits based on your workload:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "200m"
  limits:
    memory: "1Gi"
    cpu: "1"
```

### Horizontal Pod Autoscaling

HPA is configured for key services:

```bash
# View HPA status
kubectl get hpa -n audiobook

# Check current scaling metrics
kubectl describe hpa backend-hpa -n audiobook
```

### Storage Performance

For better I/O performance:

1. Use SSD-backed storage classes
2. Configure appropriate I/O limits
3. Use local storage for temporary files
4. Consider using Redis for session storage

## 🔄 Updates and Rollbacks

### Rolling Updates

```bash
# Update backend image
kubectl set image deployment/backend backend=audiobook/backend:v2.0.0 -n audiobook

# Check rollout status
kubectl rollout status deployment/backend -n audiobook
```

### Rollbacks

```bash
# View rollout history
kubectl rollout history deployment/backend -n audiobook

# Rollback to previous version
kubectl rollout undo deployment/backend -n audiobook

# Rollback to specific revision
kubectl rollout undo deployment/backend --to-revision=2 -n audiobook
```

## 🌍 Multi-Environment Setup

### Environment Differences

| Component | Development | Staging | Production |
|-----------|-------------|---------|------------|
| Replicas | 1 | 2 | 3+ |
| Resources | Low | Medium | High |
| Monitoring | Optional | Basic | Full |
| Logging | Console | Basic ELK | Full ELK |
| SSL | Self-signed | Let's Encrypt | Commercial |
| Database | Single | Single | HA |

### Environment-Specific Configs

Use Kustomize for environment-specific configurations:

```bash
# Deploy with kustomize
kubectl apply -k overlays/production
kubectl apply -k overlays/staging
kubectl apply -k overlays/development
```

## 📞 Support

For deployment issues:

1. Check the deployment logs: `./deploy.sh prod logs`
2. Verify cluster resources: `kubectl top nodes`
3. Check service status: `./deploy.sh prod status`
4. Review pod logs: `kubectl logs -f deployment/<service> -n audiobook`

## 📚 Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Charts](https://helm.sh/)
- [Prometheus Monitoring](https://prometheus.io/)
- [ELK Stack Guide](https://www.elastic.co/guide/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)