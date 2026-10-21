@echo off
chcp 65001 >nul
title RevOps OS - Deploy to GitHub and VPS
python "%~dp0deploy_to_vps.py" %*
echo.
pause
