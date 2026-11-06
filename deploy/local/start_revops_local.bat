@echo off
chcp 65001 >nul
title RevOps Enterprise OS - Local Stack Runner
echo ===================================================
echo   RevOps Enterprise OS - Local Stack Runner (RTX 5060 Ti)
echo ===================================================

echo [1/5] Checking Ollama Service...
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I /N "ollama.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Ollama is already running.
) else (
    echo [*] Starting Ollama with models at C:\Ollama...
    start "Ollama Engine" /min cmd /c "set OLLAMA_MODELS=C:\Ollama && ollama serve"
    ping 127.0.0.1 -n 4 >nul
)

echo [2/5] Starting Local AI Audit Service (Whisper CUDA + Ollama)...
curl -s http://127.0.0.1:8765/health >nul 2>&1
if "%ERRORLEVEL%"=="0" (
    echo [OK] Local AI Audit service is already running on port 8765.
) else (
    echo [*] Launching Local AI Audit Service...
    start "RevOps AI Audit Engine" /min cmd /c "C:\Users\strel\local_audit\run_service.bat"
    ping 127.0.0.1 -n 4 >nul
)

echo [3/5] Starting Docker Stack (Postgres, Redis, FastAPI, n8n)...
cd /d C:\revops
docker compose up -d
if "%ERRORLEVEL%"=="0" (
    echo [OK] Docker containers are active.
) else (
    echo [ERROR] Failed to start Docker Compose. Ensure Docker Desktop is running.
)

echo [4/5] Starting Cloudflare Tunnel...
tasklist /FI "IMAGENAME eq cloudflared.exe" 2>NUL | find /I /N "cloudflared.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Cloudflare Tunnel is already running.
) else (
    echo [*] Launching Cloudflare Tunnel...
    start "Cloudflare Tunnel (ai-rop.ru)" /min "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --config C:\Users\strel\.cloudflared\config.yml --protocol http2 run
)

echo [5/5] Starting Telegram Bot Runner...
tasklist /FI "WINDOWTITLE eq CrewAI - Telegram Bot Runner*" 2>NUL | find /I /N "python.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Telegram Bot is already running.
) else (
    echo [*] Launching Telegram Bot Runner...
    start "CrewAI - Telegram Bot Runner" /min cmd /c "cd /d C:\Users\strel\my_ai_crew && .\venv\Scripts\python.exe telegram_bot_runner.py"
)

echo ===================================================
echo [OK] RevOps OS local stack is fully operational!
echo      - API: https://report.ai-rop.ru (http://localhost:8000)
echo      - Webhooks: https://webhook.ai-rop.ru (http://localhost:5678)
echo      - Local Audit Engine: http://127.0.0.1:8765
echo ===================================================
ping 127.0.0.1 -n 4 >nul
