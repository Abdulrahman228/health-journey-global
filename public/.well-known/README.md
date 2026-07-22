# App / Universal Links for `https://mytabibi.com/doctor/{id}`

These two files let the doctor's shared link **open the app in-app** (instead of the
website) when the app is installed. If the app is not installed, the link opens the
web page as normal — so there is no downside to deploying them.

The custom scheme `tabibi://doctor/{id}` already opens the app with **no** web setup;
these files only add the polished `https://` behaviour.

## `assetlinks.json` (Android App Links)
Replace `REPLACE_WITH_YOUR_RELEASE_SIGNING_SHA256_FINGERPRINT` with the SHA-256
fingerprint of the **release** signing key:

```
keytool -list -v -keystore <your-release.keystore> -alias <alias>
```

Copy the `SHA256:` value (the `AA:BB:CC:...` colon-separated hex).
If you use Google Play App Signing, use the fingerprint shown in
Play Console → Setup → App integrity → App signing key certificate.

## `apple-app-site-association` (iOS Universal Links)
Replace `REPLACE_TEAMID` with your Apple Developer **Team ID** (Membership page),
giving e.g. `ABCDE12345.com.mytabibi.app`. Also add the
`applinks:mytabibi.com` **Associated Domains** entitlement to the iOS target
(Signing & Capabilities), which requires a real `DEVELOPMENT_TEAM` in `project.yml`.

## Serving requirements (Cloudflare Worker)
* Both files must be reachable at:
  * `https://mytabibi.com/.well-known/assetlinks.json`
  * `https://mytabibi.com/.well-known/apple-app-site-association`
* `apple-app-site-association` **must be served with `Content-Type: application/json`**
  and **no** file extension (it has none on purpose).
* No redirects, HTTPS only.
