@echo off
title SIG Purple - Enlace Publico Internet (Cloudflare Tunnel)
echo ====================================================
echo   SIG Purple - Compartir en Internet (Cloudflare)
echo ====================================================
echo.
echo Generando enlace publico seguro con HTTPS...
echo Tu equipo podra acceder desde cualquier telefono o PC.
echo.
echo [!] Para cerrar el enlace publico, simplemente cierra esta ventana.
echo.
"%~dp0cloudflared.exe" tunnel --url http://localhost:5173
pause

