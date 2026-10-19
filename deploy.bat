@echo off
chcp 65001 >nul
title RevOps OS - Deploy to GitHub and VPS
python "C:\Users\strel\my_ai_crew\deploy_to_vps.py" %*
echo.
pause
