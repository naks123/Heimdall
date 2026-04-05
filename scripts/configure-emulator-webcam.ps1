<#
  Point the Android Emulator's front camera at your PC's webcam (so Expo Camera shows a real feed).

  Default AVD folder: $env:USERPROFILE\.android\avd\Medium_Phone.avd\config.ini
  Override: -ConfigPath "C:\path\to\config.ini"

  After changing, cold-boot the AVD (close emulator → start again, or wipe data if the camera stays black).

  If you see a black preview, try -FrontCamera webcam1 or edit config.ini manually.
#>
param(
  [string] $FrontCamera = "webcam0",
  [string] $ConfigPath = "$env:USERPROFILE\.android\avd\Medium_Phone.avd\config.ini"
)

if (-not (Test-Path $ConfigPath)) {
  Write-Error "config.ini not found: $ConfigPath`nOpen Android Studio → Device Manager → edit your AVD and note the .avd folder name."
  exit 1
}

$c = Get-Content $ConfigPath -Raw
$c = $c -replace "hw\.camera\.front=.*", "hw.camera.front=$FrontCamera"
Set-Content -Path $ConfigPath -Value $c -NoNewline
Write-Host "Set hw.camera.front=$FrontCamera in $ConfigPath"
Write-Host "Restart the emulator (full quit, then start again) for the change to apply."
