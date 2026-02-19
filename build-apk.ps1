$ErrorActionPreference = "Stop"

# Get short path to avoid Korean encoding issues
$shortPath = (New-Object -ComObject Scripting.FileSystemObject).GetFolder("C:\iswmemo\growthpad-mobile").ShortPath
Write-Host "Short path: $shortPath"

Set-Location "$shortPath\android"
Write-Host "Building APK..."
& .\gradlew.bat assembleRelease

if ($LASTEXITCODE -eq 0) {
    $apkPath = "$shortPath\android\app\build\outputs\apk\release\app-release.apk"
    $destPath = "$shortPath\DdobakDdobak-v2.9.5-release.apk"
    if (Test-Path $apkPath) {
        Copy-Item $apkPath $destPath
        Write-Host "APK copied to: $destPath"
    }
    Write-Host "BUILD SUCCESS"
} else {
    Write-Host "BUILD FAILED"
}
