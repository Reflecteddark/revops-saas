@echo off
chcp 65001 >nul
title RevOps SaaS - Остановка сервера

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R ":8000.*LISTENING"') do (
    if not "%%a"=="" (
        echo [*] Завершение процесса PID %%a на порту 8000...
        taskkill /F /PID %%a >nul 2>&1
    )
)

taskkill /F /FI "WINDOWTITLE eq RevOps SaaS Backend*" >nul 2>&1
echo [OK] Сервер остановлен.
exit /b 0
