@echo off
title SIG Purple - Enlace ngrok
echo ====================================================
echo   SIG Purple - Enlace Publico con ngrok
echo ====================================================
echo.
echo Iniciando tunel con ngrok hacia http://localhost:5173...
echo.
"%~dp0ngrok.exe" http 5173
pause

