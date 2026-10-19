@echo off
chcp 65001 >nul
title RevOps OS — Деплой на GitHub и VPS (Aeza 24/7)
cd /d "%~dp0"

echo ======================================================================
echo    REVOPS ENTERPRISE OS — СКВОЗНОЙ ДЕПЛОЙ (GITHUB + VPS AEZA 24/7)
echo ======================================================================
echo.

python "%~dp0deploy_to_vps.py" %*

if errorlevel 1 (
    echo.
    echo [ОШИБКА] Деплой завершился с ошибкой. Проверьте сообщения выше.
    echo.
    pause
    exit /b 1
)

echo.
pause
