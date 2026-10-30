@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================================
echo   RevOps Intelligence OS - Загрузчик звонков (MP3)
echo ========================================================
echo.

if not "%~1"=="" goto PROCESS_FILE

:PROCESS_FOLDER
echo [ИНФО] Сканирование папки 'calls_to_upload'...
python scripts\upload_call_to_amocrm.py --folder calls_to_upload
goto FINISH

:PROCESS_FILE
echo [ИНФО] Загрузка файла: %~1
python scripts\upload_call_to_amocrm.py "%~1"
goto FINISH

:FINISH
echo.
echo ========================================================
echo   Работа завершена. Окно закроется при нажатии клавиши.
echo ========================================================
pause
