@echo off
chcp 65001 >nul
title Cloudflare Tunnel Watchdog (ai-rop.ru)
echo [*] Cloudflare Tunnel Watchdog starting...

:loop
echo [%DATE% %TIME%] Starting Cloudflare Tunnel...
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --config "C:\Users\strel\.cloudflared\config.yml" --protocol http2 run
echo [%DATE% %TIME%] Cloudflare Tunnel exited (code %ERRORLEVEL%). Reconnecting in 5 seconds...
ping 127.0.0.1 -n 6 >nul
goto loop
