@echo off
REM ============================================================================
REM Build the Transitrix Studio VS Code extension and place the .vsix in output\
REM
REM Usage:
REM   build-extension.bat                                Build a universal VSIX
REM                                                      (local install only - see warning below)
REM   build-extension.bat --bump                         Patch bump, then universal build
REM   build-extension.bat --target win32-x64             Build a targeted VSIX
REM   build-extension.bat --bump --target win32-x64      Patch bump + targeted build
REM
REM Supported targets (per docs/packaging.md): win32-x64, win32-arm64,
REM   darwin-x64, darwin-arm64, linux-x64, linux-arm64.
REM   Each must be built on a matching OS/arch (the @resvg/resvg-js native
REM   binary is fetched per platform on npm install).
REM
REM WARNING - universal build (no --target):
REM   `vsce package` without --target produces a VSIX claiming universal
REM   compatibility but carrying only the build machine's resvg binary.
REM   PNG export will fail on any other OS/arch. Use ONLY for local install
REM   testing on the build machine - NEVER publish to the Marketplace
REM   without --target. See docs/packaging.md.
REM ============================================================================

setlocal EnableExtensions
cd /d "%~dp0"

set "BUMP=0"
set "TARGET="

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--bump" (
  set "BUMP=1"
  shift
  goto parse_args
)
if /I "%~1"=="--target" (
  if "%~2"=="" (
    echo build-extension: --target requires a value ^(e.g. win32-x64^).
    exit /b 2
  )
  set "TARGET=%~2"
  shift
  shift
  goto parse_args
)
echo build-extension: unknown argument "%~1".
echo Usage: build-extension.bat [--bump] [--target ^<target^>]
exit /b 2
:args_done

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
if defined TARGET (
  echo === [3/3] vsce package --target %TARGET% -^> output\
) else (
  echo === [3/3] vsce package -^> output\
  echo build-extension: WARNING - no --target given; VSIX is local-install only.
  echo build-extension: see docs\packaging.md before publishing to the Marketplace.
)
pushd extension
if defined TARGET (
  call npx --no-install vsce package --target %TARGET% -o ..\output
) else (
  call npx --no-install vsce package -o ..\output
)
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
