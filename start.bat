@echo off
cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
)
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    call npm --prefix frontend install
)

echo Building frontend...
call npm run build

echo Starting server...
start "" http://localhost:5000
call npm start
