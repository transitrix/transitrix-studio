@echo off
REM ============================================================================
REM Build the Transitrix Studio VS Code extension and place the .vsix in output\
REM
REM Usage:
REM   build-extension.bat           Build without bumping the version
REM   build-extension.bat --bump    Bump patch version, then build
REM ============================================================================

setlocal EnableExtensions
cd /d "%~dp0"

set "BUMP=0"
if /I "%~1"=="--bump" set "BUMP=1"

if not exist output mkdir output

echo.
echo === [1/3] extension:prep
call npm run extension:prep
if errorlevel 1 (
  echo build-extension: extension:prep failed.
  exit /b 1
)

if "%BUMP%"=="1" (
  echo.
  echo === [2/3] bump-extension-version
  call npm run bump-extension-version
  if errorlevel 1 (
    echo build-extension: bump-extension-version failed.
    exit /b 1
  )
) else (
  echo.
  echo === [2/3] skipping version bump ^(pass --bump to enable^)
)

echo.
echo === [3/3] vsce package -^> output\
pushd extension
call npx --no-install vsce package -o ..\output
set "RC=%errorlevel%"
popd
if not "%RC%"=="0" (
  echo build-extension: vsce package failed with exit code %RC%.
  exit /b %RC%
)

echo.
echo Build complete. Artifacts in output\:
dir /b output\*.vsix
endlocal
