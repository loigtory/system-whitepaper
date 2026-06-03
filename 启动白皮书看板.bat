@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo.
echo 正在启动系统白皮书本地 H5 看板...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dashboard.ps1"
if errorlevel 1 (
  echo.
  echo 启动失败，请查看上方错误信息。
  pause
  exit /b 1
)

echo.
echo 启动完成。本窗口可关闭；看板在后台最小化 node 窗口中运行。
timeout /t 3 >nul
exit /b 0
