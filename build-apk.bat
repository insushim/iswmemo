@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0android"
echo Building APK from: %CD%
call gradlew.bat assembleRelease
if %ERRORLEVEL% EQU 0 (
    echo BUILD SUCCESS
    if exist "app\build\outputs\apk\release\app-release.apk" (
        copy /Y "app\build\outputs\apk\release\app-release.apk" "%~dp0GrowthPad-v1.4.0-release.apk"
        echo APK copied!
    )
) else (
    echo BUILD FAILED
)
