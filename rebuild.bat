@echo off
cd /d "H:\claude-code-assistant"
title Rebuilding ClaudeMate...
echo === Rebuilding ClaudeMate ===
call npm run build
echo.
echo === Build complete! ===
echo You can now launch ClaudeMate from the desktop shortcut.
pause
