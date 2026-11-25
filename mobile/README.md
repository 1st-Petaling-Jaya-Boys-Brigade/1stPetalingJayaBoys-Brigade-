# 1st PJ BB Portal mobile installation

The Brigade distributes a signed Android APK directly and installs the portal on iPhone from Safari. Both paths use the same member sign-in, terms, and privacy onboarding.

## Build a signed Android APK

Install Node.js 22+, JDK 21, Android SDK Platform 36, and Android Build-Tools 35.0.0 and 36.0.0. Gradle uses Build-Tools 35 for this project and the commands below use the 36.0.0 signature verifier. Set `JAVA_HOME` and `ANDROID_HOME` to the installed tools. [Android command-line build guide](https://developer.android.com/build/building-cmdline)

From the repository root in PowerShell, create the signing profile **once**. If the Brigade already has a release key, use that key and go straight to the build commands.

```powershell
$signingDir = Join-Path $env:LOCALAPPDATA '1stPJBB/AndroidSigning'
New-Item -ItemType Directory -Force -Path $signingDir | Out-Null
$keyFile = Join-Path $signingDir 'portal-release.p12'
$passwordFile = Join-Path $signingDir 'portal-release-password.dpapi'
if ((Test-Path $keyFile) -or (Test-Path $passwordFile)) { throw 'Use the existing signing profile or restore it from backup.' }
$secret = Read-Host 'Choose the release keystore password' -AsSecureString
$env:PORTAL_RELEASE_PASSWORD = [Net.NetworkCredential]::new('', $secret).Password
try {
    & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -storetype PKCS12 -keystore $keyFile `
        -storepass:env PORTAL_RELEASE_PASSWORD -alias portal-release -keyalg RSA -keysize 3072 `
        -validity 10000 -dname 'CN=1st PJ BB Portal, O=1st Petaling Jaya Boys Brigade, C=MY'
    if ($LASTEXITCODE -ne 0) { throw 'Keystore generation failed.' }
    $secret | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordFile
} finally {
    Remove-Item Env:PORTAL_RELEASE_PASSWORD -ErrorAction SilentlyContinue
}
```

Build, verify and locate the signed APK:

```powershell
$signingDir = Join-Path $env:LOCALAPPDATA '1stPJBB/AndroidSigning'
$env:PORTAL_RELEASE_KEYSTORE = Join-Path $signingDir 'portal-release.p12'
$secret = Get-Content -LiteralPath (Join-Path $signingDir 'portal-release-password.dpapi') | ConvertTo-SecureString
$env:PORTAL_RELEASE_PASSWORD = [Net.NetworkCredential]::new('', $secret).Password
try {
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Portal dependency installation failed.' }
    npm.cmd ci --prefix mobile
    if ($LASTEXITCODE -ne 0) { throw 'Mobile dependency installation failed.' }
    npm.cmd run sync:android --prefix mobile
    if ($LASTEXITCODE -ne 0) { throw 'Android sync failed.' }
    & '.\mobile\android\gradlew.bat' -p mobile/android assembleRelease
    if ($LASTEXITCODE -ne 0) { throw 'Android assembly failed.' }
    $apk = 'mobile/android/app/build/outputs/apk/release/app-release.apk'
    & "$env:ANDROID_HOME/build-tools/36.0.0/apksigner.bat" verify --print-certs $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
    Get-FileHash -Algorithm SHA256 $apk
} finally {
    Remove-Item Env:PORTAL_RELEASE_PASSWORD -ErrorAction SilentlyContinue
}
```

Keep an encrypted backup of the keystore and its password in the Brigade's secure storage. The local DPAPI password file can be decrypted only by the Windows account that created it on that machine. Keep the same key for updates and increase `versionCode` in `android/app/build.gradle` for each release. Android may prompt members to allow installation from their browser or file manager. Verify the APK on an approved device before sharing it. [Android app signing](https://developer.android.com/studio/publish/app-signing)

## Make the app available in the portal

1. Put the verified `app-release.apk` at a stable HTTPS download URL on a service that enforces the Brigade's member access rules. Share the APK through a private member channel if there is no suitable HTTPS host yet. A public repository release or anyone-with-the-link host allows wider downloads.
2. Set `VITE_ANDROID_APK_URL` on Vite-based deployments. For static GitHub Pages deployments, set the fallback value of `ANDROID_APK_URL` in `js/config.js` before deploying. Use the host's login-controlled link and avoid embedding expiring credentials in the portal source.
3. Signed-in members can open **Install App** in the sidebar or mobile **More** menu. The Android button and QR code use the configured URL. The iPhone QR code opens the portal. QR codes are generated on the device from these same links.

## Install on iPhone

1. Open the portal in **Safari**.
2. Tap **Share → Add to Home Screen**, enable **Open as Web App** if shown, and tap **Add**. Open the new icon to start the portal in standalone mode. The phone still controls its status area and Home indicator. [Apple's Home Screen instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)
3. On iOS or iPadOS 16.4 or newer, sign in from the Home Screen app. Choose **Enable alerts** in the portal's setup prompt, then tap **Allow**. New members can enable alerts in the notification step of onboarding. Use **Settings → Notifications & Audio Alerts → Test** to send a real push. [WebKit Home Screen push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## Notification delivery

Apply `supabase/migrations/029_task_completion_and_overdue_reminders.sql` when deploying task completion timing. The migration records new completion times and clears them when tasks reopen. Legacy completions keep an unknown completion time.

The signed-in portal checks overdue assignments as it refreshes notifications. Browser and desktop popups depend on device notification permission and the portal running. Android receives a daily FCM reminder at about 8:05 AM Malaysia time. A second scheduled run at 8:35 AM retries sends the provider rejected, using a database claim to avoid repeats. Android uses the existing portal alert channel and chime. The device controls sound and notification permissions.

The scheduled workflow uses a short-lived GitHub Actions OIDC token. Supabase verifies the repository, workflow, and `main` branch before it resolves overdue assignees and sends Android and iPhone/iPad notifications. The Firebase account stays in the Supabase Edge Function secret `FCM_SERVICE_ACCOUNT_JSON`.

Apply `supabase/migrations/037_overdue_reminder_assignments.sql` and redeploy `portal-web-push` before enabling this workflow revision. Use **Actions → Mobile overdue task reminders → Run workflow** on `main` with the default dry-run setting to check authentication, configuration, and eligible recipients. Clearing dry run sends reminders to eligible assignees, with deduplication for the same day.

### iPhone and iPad Web Push backend

Apply `supabase/migrations/032_portal_web_push.sql`, set `PORTAL_VAPID_PUBLIC_KEY` and `PORTAL_VAPID_PRIVATE_KEY` as Supabase Edge Function secrets, and deploy `portal-web-push` with `supabase functions deploy portal-web-push --no-verify-jwt`. The function verifies its own notification-only member tokens or the scheduled sender's service credential. Keep the VAPID private key in Supabase secrets and retain the pair across deployments. Replacing the pair requires devices to resubscribe.

The Home Screen app receives Web Push in the background. The phone controls delivery presentation and its system sound through Settings and Focus. Event submissions require a recent portal sign-in for authenticated push fan-out. The existing Android APK continues receiving FCM alerts. Publishing a later APK build with this web bundle also enables event submissions from the APK to send to iPhones.
