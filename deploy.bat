@echo off
echo ============================================================
echo   Talents - Deploiement local reseau LDM Groupe
echo ============================================================
echo.

echo [1/4] Installation des dependances backend...
cd backend
call npm install
if %errorlevel% neq 0 ( echo ERREUR installation backend & pause & exit /b 1 )

echo [2/4] Compilation TypeScript backend...
call npm run build
if %errorlevel% neq 0 ( echo ERREUR compilation backend & pause & exit /b 1 )
cd ..

echo [3/4] Build du frontend React...
cd frontend
call npm install
call npm run build
if %errorlevel% neq 0 ( echo ERREUR build frontend & pause & exit /b 1 )
cd ..

echo [4/4] Demarrage du serveur...
echo.
echo ============================================================
echo   Application disponible sur :
echo   http://192.168.40.55:5050
echo   (accessible depuis tous les postes du reseau)
echo ============================================================
echo.
cd backend
node dist/index.js
