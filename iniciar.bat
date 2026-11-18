@echo off
title SIG Purple - Sistema de Gestion Local
if "%PORT%"=="" set PORT=5000
if "%VITE_PORT%"=="" set VITE_PORT=5173
if "%VITE_API_URL%"=="" set VITE_API_URL=http://localhost:%PORT%/api

echo ====================================================
echo   Iniciando SIG Purple - Entorno Local Completo
echo   Base de Datos: PostgreSQL Local (127.0.0.1:5432)
echo   Backend:       http://localhost:%PORT%
echo   Frontend:      http://localhost:%VITE_PORT%
echo ====================================================

echo [1/3] Verificando servicio de PostgreSQL...
sc query postgresql-x64-18 | find "RUNNING" >nul
if %ERRORLEVEL% NEQ 0 (
  echo   -> Iniciando servicio PostgreSQL...
  net start postgresql-x64-18
) else (
  echo   -> PostgreSQL esta activo y funcionando.
)

echo [2/3] Iniciando Backend API...
cd server
start /B cmd /c "set PORT=%PORT% && npm run dev"
cd ..

echo [3/3] Iniciando Frontend y abriendo el navegador...
echo VITE_API_URL=%VITE_API_URL%> .env
set VITE_API_URL=%VITE_API_URL%

rem Abrir navegador automaticamente tras 3 segundos
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:%VITE_PORT%"

npm run dev -- --port %VITE_PORT% --host
