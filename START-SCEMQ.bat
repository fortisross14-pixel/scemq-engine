@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Installing SCEMQ dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)
echo Starting SCEMQ...
call npm run dev
