# 1st PJ BB Portal mobile app

The Android and iOS projects wrap the same portal build used on the web. The application ID on both platforms is `org.firstpjbb.portal`. The launcher icons and splash assets use the company crest from `assets/logo.png`.

## Build and device checks

From the repository root, with Node.js 22 or newer:

```sh
npm ci
npm ci --prefix mobile
npm test --prefix mobile
npm run sync --prefix mobile
```

- **Android** uses Android Studio and the Android 36 SDK. Open `mobile/android`, run the app on a test device, then use Android Studio's signed bundle or APK workflow for the pilot. The project's minimum Android version is API 24.
- **iOS** uses macOS and Xcode 26 or newer. Open `mobile/ios/App/App.xcodeproj`, select the Brigade's signing team, run on a test device, then archive for App Store Connect. The project's deployment target is iOS 15.
- If the crest changes, regenerate the checked-in launcher and splash assets with the updated logo and the `#111e33` navy background. [Capacitor icon and splash assets](https://capacitorjs.com/docs/guides/splash-screens-and-icons)
- Check sign-in, the login gate, existing terms and privacy consent, and existing parental consent with test accounts. Test the CAPTCHA paths from each native WebView origin before inviting families.
- Check **Enable Device Pop-ups** and **Send Test Pop-up** in onboarding, plus the notification settings for existing members. Deny the OS prompt, continue into the portal, and re-enable from phone settings. Verify the bundled chime with sound on and off, including the notification center and lock screen. File selection should open a picker only when a person chooses to upload.

[Capacitor build prerequisites](https://capacitorjs.com/docs/getting-started/environment-setup)

## Notification delivery

This build schedules local OS alerts for inbox notifications received while the portal is running. Notifications are optional and show generic content on the lock screen. The **Notification Sound** setting selects the company chime or silent delivery. The phone's sound, notification and Focus settings apply.

Delivery while the app is closed requires a server-side sender and Firebase Cloud Messaging for Android and Apple Push Notification service for iOS. Before enabling remote push, bind each device token to the authenticated member and the device's opt-in, route events only to their authorized recipients, and remove the token on sign-out or revocation. Verify on a physical device with the app open, backgrounded, and closed.

[Android notification channels](https://developer.android.com/develop/ui/views/notifications/channels) · [Apple remote notifications](https://developer.apple.com/documentation/usernotifications)

## Invite-only pilot

1. **Android.** Create the Play Console app and grant the pilot an email-restricted testing track if needed so testers have listing access. In Internal App Sharing, choose **Email lists** for link availability and add the pilot's Google Play accounts. Upload the build, copy the generated link, and make the QR code from that link. Testers may need to enable Internal App Sharing in Google Play. Each link permits up to 100 downloads and expires after 60 days. Keep the app off open testing and production. [Google Play Internal App Sharing](https://support.google.com/googleplay/android-developer/answer/9844679)
2. **iOS.** Create the App Store Connect app, upload the archive, and use a TestFlight external group for members and parents. Submit the first external build for beta review and invite approved testers by email. A TestFlight public link can be forwarded, so use a QR code for member-only installation instructions and direct testers to their individual invitations. Each TestFlight build lasts 90 days. [Apple external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers) · [TestFlight build expiration](https://developer.apple.com/videos/play/tech-talks/110343/)
3. **Validate the invitation.** Install from both approved and unapproved test accounts before sharing instructions. Keep credentials and keys in organization-managed developer accounts or secret stores and distribute installation details through the approved member channel.
