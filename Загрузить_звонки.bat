@echo off
chcp 65001 >nul
title RevOps - Загрузчик звонков в amoCRM

echo ========================================================
echo   RevOps Intelligence OS - Загрузчик звонков (MP3)
echo ========================================================
echo.

if "%~1"=="" (
    echo [ИНФО] Файл не перетащен. Сканирование папки 'calls_to_upload'...
    python "%~dp0scripts\upload_call_to_amocrm.py" --folder "%~dp0calls_to_upload"
) else (
    echo [ИНФО] Загрузка перетащенного файла: %~1
    python "%~dp0scripts\upload_call_to_amocrm.py" "%~1"
)

echo.
echo ========================================================
echo   Работа завершена. Окно закроется при нажатии клавиши.
echo ========================================================
pause
