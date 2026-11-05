@echo off
chcp 65001 >nul
title RevOps Enterprise OS - Stop Local Stack
echo ===================================================
echo   Stopping RevOps Enterprise OS Local Services
echo ===================================================

echo [1/3] Stopping Docker Containers...
cd /d C:\revops
docker compose stop

echo [2/3] Stopping Local Daemons (Audit Service, Cloudflare Tunnel, Telegram Bot)...
taskkill /F /IM cloudflared.exe 2>nul
taskkill /F /FI "WINDOWTITLE eq RevOps AI Audit Engine*" 2>nul
taskkill /F /FI "WINDOWTITLE eq CrewAI - Telegram Bot Runner*" 2>nul

echo [3/3] Done. Note: Docker Desktop and Ollama background daemon remain untouched.
echo ===================================================
timeout /t 3
