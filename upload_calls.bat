@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================================
echo   RevOps Intelligence OS - Загрузка звонков в amoCRM
echo ========================================================
echo.

set "TARGET_TENANT="
set /p "TARGET_TENANT=Введите ID тенанта (обязательно, например TNT-004): "
if "%TARGET_TENANT%"=="" (
    echo [ОШИБКА] ID тенанта не указан.
    pause
    exit /b 1
)
if "%REVOPS_ADMIN_KEY%"=="" (
    echo [ОШИБКА] Не задан ключ администратора. Выполните один раз: setx REVOPS_ADMIN_KEY "ваш_ключ"
    echo          и откройте это окно заново.
    pause
    exit /b 1
)

echo.
echo [ИНФО] Выбран тенант: %TARGET_TENANT%
echo.

if not "%~1"=="" goto PROCESS_FILE

:PROCESS_FOLDER
echo [РЕЖИМ] Пакетная загрузка из папки 'calls_to_upload'...
python scripts\upload_call_to_amocrm.py --folder calls_to_upload --tenant %TARGET_TENANT%
goto FINISH

:PROCESS_FILE
echo [РЕЖИМ] Загрузка файла: %~1
python scripts\upload_call_to_amocrm.py "%~1" --tenant %TARGET_TENANT%
goto FINISH

:FINISH
echo.
echo ========================================================
echo   Загрузка завершена. Окно закроется при нажатии клавиши.
echo ========================================================
pause