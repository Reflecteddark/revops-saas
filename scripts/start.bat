@echo off
chcp 65001 >nul
title RevOps SaaS - Запуск сервера

pushd "%~dp0.."
set "PROJECT_DIR=%CD%"

netstat -ano | findstr /R ":8000.*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [i] Сервер уже запущен на порту 8000!
    start http://localhost:8000/
    popd
    exit /b 0
)

echo [*] Запуск FastAPI Uvicorn сервера на http://localhost:8000 ...
start "RevOps SaaS Backend (Port 8000)" cmd /k python -m uvicorn apps.api.main:app --host 0.0.0.0 --port 8000 --reload

ping 127.0.0.1 -n 4 >nul
start http://localhost:8000/
popd
exit /b 0
