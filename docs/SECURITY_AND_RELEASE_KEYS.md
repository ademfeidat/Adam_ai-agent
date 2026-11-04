# Security and Release-Key Handling

## Android signing key incident

A signing keystore was present at `android/app/release.keystore` in the repository tree. It has been removed from the working branch and matching keystore extensions are now ignored by Git. The Android Gradle release configuration also previously contained hardcoded signing passwords and could fall back to the debug signing key; those unsafe defaults have been removed. Release signing now requires all four values (`RELEASE_KEYSTORE_PATH`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`) from protected environment variables or local Gradle properties.

**Important:** deleting a file from the latest commit does not erase it from Git history, forks, cached clones, or previously downloaded copies. Treat the signing key as potentially exposed.

Before issuing a new production Android update:
1. Determine whether this key has ever signed a distributed APK.
2. If it has, check whether the app is enrolled in Google Play App Signing and whether an upload-key reset is available.
3. If it has not, generate a new signing key in a secure environment and store it only in protected CI secrets or a private local keystore.
4. If the app was distributed outside Play and relies on this certificate, do not silently replace the key: Android will reject updates signed by a different certificate. Plan a migration/reinstall path or retain the old key only if its exposure risk is explicitly accepted.
5. Remove the exposed key from Git history only after coordinating repository history rewrite, and rotate it regardless. History rewriting does not revoke copies already obtained.

Never commit `.jks`, `.keystore`, `.p12`, `.pfx`, or private `.pem` files. Do not put signing secrets in Vite variables or client-side code.

## General rules

- Keep Supabase service-role/secret keys, model-provider API keys, Firebase Admin credentials, session secrets and signing material on the server or in protected deployment environment variables.
- Public Firebase web configuration and OAuth client IDs are identifiers, not substitutes for server-side identity verification.
- Log provider names, request IDs and sanitized error codes; never log raw authorization headers, cookies, API keys or full secret-bearing environment values.
