# Publishing to the App Store and Google Play

Turncloak ships to both stores as a [Capacitor](https://capacitorjs.com) app: the same web build, wrapped in a native shell, plus a few phone features (haptics, share sheet, screen kept awake, Android back button). Both apps are built in the cloud by GitHub Actions, so no Mac is needed.

- App id (iOS bundle id and Android package): `com.turncloak.app`. It cannot change after the first upload.
- Version: `version` in `package.json`. Build numbers come from the workflow run number.
- Privacy policy: https://turncloak.app/privacy.html
- Support page: https://turncloak.app/support.html

## Day to day

```bash
npm run native:sync     # build the web app and copy it into ios/ and android/
npm run native:assets   # redraw every icon and splash screen from public/favicon.svg
```

Pull requests that touch the app run `iOS app` and `Android app` checks that make sure both still compile.

To release, open the repo's **Actions** tab, pick **iOS app** or **Android app**, and press **Run workflow** on `main`.

## One-time setup: iOS

1. **Register the app id.** In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list), add an App ID with bundle id `com.turncloak.app`. No extra capabilities are needed.
2. **Create the app** in [App Store Connect](https://appstoreconnect.apple.com/apps) → **+** → New App: platform iOS, name Turncloak, bundle id from step 1, SKU `turncloak`.
3. **Create an API key.** App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → **+**. Give it the **Admin** role, which lets the build create its own signing certificate. Download the `.p8` file (it can only be downloaded once) and note the Key ID and the Issuer ID shown above the list.
4. **Find your Team ID** under Membership details at [developer.apple.com/account](https://developer.apple.com/account).
5. **Add four repository secrets** at GitHub → repo Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
| --- | --- |
| `ASC_KEY_ID` | The Key ID from step 3 |
| `ASC_ISSUER_ID` | The Issuer ID from step 3 |
| `ASC_PRIVATE_KEY` | The whole text of the `.p8` file, including the BEGIN and END lines |
| `APPLE_TEAM_ID` | The Team ID from step 4 |

Then run **iOS app** from the Actions tab. The build appears in App Store Connect → TestFlight after Apple processes it (10 to 30 minutes). Add yourself as an internal tester and install it with the TestFlight app.

## One-time setup: Android

1. **Make an upload key.** Any Java install can do it:
   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
   Keep the file and its password safe. Google Play App Signing holds the real signing key, so a lost upload key can be reset through Play Console support, but it takes a few days.
2. **Add four repository secrets:**

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The keystore file in base64 (`base64 -w0 upload.jks` on Linux, `base64 -i upload.jks` on macOS, `[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.jks"))` in PowerShell) |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | The key password (the same as the keystore password unless you set a different one) |

3. **Run Android app** from the Actions tab and download the `.aab` from the run's Artifacts.
4. **Create the app** in [Play Console](https://play.google.com/console) → Create app, then upload that first `.aab` by hand under Testing → Internal testing. Google only accepts API uploads after the first manual one.
5. **Optional, automatic uploads.** In Google Cloud, create a service account with a JSON key, invite its email in Play Console → Users and permissions with release permissions for Turncloak, and save the JSON as the `PLAY_SERVICE_ACCOUNT_JSON` secret. From then on each run sends a draft release to internal testing.

New personal Play developer accounts must run a closed test with at least 12 testers for 14 days before the app can go to production. Start that early.

## Store listing notes

- **Name and keywords.** Do not mention the TV show "The Traitors", or use its terms ("Traitors", "Faithful", "Round Table", "banishment") in the name, subtitle, keywords, description or screenshots. The game uses its own words: Turncloaks, Truecloaks, the Council and exile. Describing the game as "a party game of loyalty and betrayal" is safe.
- **Privacy answers.** App Store "Data Not Linked to You": User Content (player names, chat, notes) and Identifiers (the anonymous user id), both used for App Functionality only. No tracking. Google Play Data safety: the same, data encrypted in transit, users can request deletion (the "Reset my data" button).
- **Account deletion.** There are no accounts, only anonymous guest ids, and "Reset my data" deletes the guest id and its games on the server.
- **Age rating.** The game has players "struck down" at night by a dagger, in a cartoon party-game sense. Expect 12+ on iOS (infrequent mild violence, unrestricted chat between players) and Teen on Google Play.
- **Review notes for Apple.** Tell the reviewer the app can be tried alone: Home → "Play the demo" plays a full game against bots on one device. Multiplayer needs a second device or the web version at the link above.
- **Guideline 4.2 (minimum functionality).** Mention the native features in the review notes: haptic feedback for votes, night strikes and your turn, the share sheet for invites, and the screen staying awake during a game.
