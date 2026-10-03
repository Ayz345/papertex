@echo off
rem PaperTeX — serve this folder and open it.
rem Writing and exporting work straight off disk, but the LaTeX compiler runs in
rem a Web Worker, and browsers will not start one on a file:// page. Serving it
rem locally is all that is needed.

cd /d "%~dp0"
set PORT=8777

where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/papertex.html
  echo Serving on http://localhost:%PORT%/papertex.html   ^(Ctrl+C to stop^)
  python -m http.server %PORT%
  goto :eof
)

where npx >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/papertex.html
  echo Serving on http://localhost:%PORT%/papertex.html   ^(Ctrl+C to stop^)
  npx --yes http-server -p %PORT% -c-1
  goto :eof
)

echo Neither Python nor Node was found on this machine.
echo Install either one, or serve this folder with any static web server.
pause
