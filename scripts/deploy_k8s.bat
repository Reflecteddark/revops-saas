@echo off
title RevOps Intelligence - Kubernetes Deployer

echo ========================================================
echo     REVOPS INTELLIGENCE SAAS - KUBERNETES DEPLOYMENT
echo ========================================================
echo.

where kubectl >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] kubectl is not found in PATH!
    echo Please install kubectl or configure your Kubernetes context (Minikube / k3s / EKS / GKE).
    pause
    exit /b 1
)

echo [1/3] Validating Kubernetes manifests (dry-run)...
kubectl apply -k deploy/k8s --dry-run=client
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Manifest validation failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Applying Kustomize resources to cluster...
kubectl apply -k deploy/k8s

echo.
echo [3/3] Checking rollout status of API and Read Replicas...
kubectl rollout status deployment/revops-api -n revops-saas --timeout=60s 2>nul
kubectl rollout status deployment/postgres-read-replica -n revops-saas --timeout=60s 2>nul

echo.
echo ========================================================
echo   Deployment completed!
echo   Run 'kubectl get pods -n revops-saas' to view status.
echo ========================================================
pause
