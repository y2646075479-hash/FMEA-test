@echo off
chcp 65001 >nul
setlocal ENABLEDELAYEDEXPANSION

REM === 路径与端口 ===
set "ROOT=%~dp0"
set "SERVER=%ROOT%server"
set "PORT=3001"
set "HEALTH=http://127.0.0.1:%PORT%/health"
set "INDEX=%ROOT%index.html"

echo [INFO] Project root: "%ROOT%"
if not exist "%SERVER%\server.js" (
  echo [ERROR] 未找到 "%SERVER%\server.js"。请确认目录结构：^<项目根^>\server\server.js
  pause
  exit /b 1
)

REM === 启动后端（新窗口保持日志） ===
echo [INFO] 启动后端服务...
start "FMEA Server" cmd /k "cd /d ""%SERVER%"" && npm start"

REM === 等待后端就绪（最多 30s）===
echo [INFO] 等待 http://127.0.0.1:%PORT%/health ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$u='%HEALTH%';$t=[DateTime]::Now.AddSeconds(30);" ^
  "while([DateTime]::Now -lt $t){" ^
  "  try{ $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 2; if($r.StatusCode -eq 200){'READY';break} }catch{}" ^
  "  Start-Sleep -Milliseconds 500" ^
  "}" > "%TEMP%\fmea_ready.flag"

for /f "usebackq delims=" %%i in ("%TEMP%\fmea_ready.flag") do set READY=%%i
del "%TEMP%\fmea_ready.flag" >nul 2>nul

if /i not "%READY%"=="READY" (
  echo [WARN] 健康检查超时（可能网速或防火墙原因）。稍后再试或手动访问：%HEALTH%
) else (
  echo [OK] 后端就绪。
)

REM === 打开前端页面 ===
if exist "%INDEX%" (
  echo [INFO] 打开前端：%INDEX%
  start "" "%INDEX%"
) else (
  echo [ERROR] 未找到 index.html：%INDEX%
)

echo.
echo [TIP] 如需关闭后端，可手动关掉 "FMEA Server" 窗口，或运行 stop_server.bat
echo.
endlocal
exit /b 0
