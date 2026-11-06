@echo off
chcp 65001 >nul
title Cloudflare Tunnel Watchdog (ai-rop.ru)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0watchdog_cloudflared.ps1"
