@echo off
title Rol de Turno - HMEP

echo.
echo ============================================
echo    Rol de Turno - Hospital Maria HMEP
echo ============================================
echo.

echo [1/2] Iniciando Backend API (puerto 3001)...
start "Backend API" cmd /k "cd /d "%~dp0backend" && node server.js"

timeout /t 3 /nobreak > nul

echo [2/2] Iniciando App Web (puerto 8081)...
start "App Web" cmd /k "cd /d "%~dp0app" && npx expo start --web"

timeout /t 5 /nobreak > nul

echo.
echo App lista en: http://localhost:8081
echo API lista en: http://localhost:3001/api/health
echo.
start http://localhost:8081

pause
