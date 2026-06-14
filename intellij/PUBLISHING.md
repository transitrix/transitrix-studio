# Publishing the Transitrix Studio IntelliJ plugin

Runbook for releasing `intellij/` to the [JetBrains Marketplace](https://plugins.jetbrains.com).
Build/packaging itself is covered by `scripts/package-intellij-plugin.mjs`; this
file is the publish side.

## One-time setup

### 1. Vendor account
Sign in at <https://plugins.jetbrains.com> with a JetBrains Account, create a
**vendor profile**, and accept the Marketplace Developer Agreement.

### 2. Signing certificate
Marketplace shows a "signed by author" badge for signed plugins. Generate a
chain + private key once:

```bash
openssl genpkey -aes-256-cbc -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:4096
openssl req -key private.pem -new -x509 -days 3650 -out chain.crt
```

**Never commit `private.pem` / `chain.crt` or the password.** Keep them in a
password manager / CI secret store.

### 3. Marketplace token
plugins.jetbrains.com → your profile → **My Tokens** → create a permanent token.

## Environment variables

`build.gradle.kts` reads all secrets from the environment — nothing lives in the
repo:

| Variable | Source |
|----------|--------|
| `CERTIFICATE_CHAIN` | contents of `chain.crt` |
| `PRIVATE_KEY` | contents of `private.pem` |
| `PRIVATE_KEY_PASSWORD` | the passphrase set during `genpkey` |
| `PUBLISH_TOKEN` | the Marketplace permanent token |

## First release (manual — required)

The **first version of a new plugin must be uploaded through the website**;
`publishPlugin` only updates an existing plugin.

1. `node scripts/package-intellij-plugin.mjs` → `intellij/build/distributions/transitrix-intellij-<version>.zip`.
2. plugins.jetbrains.com → **Upload plugin** → select the `.zip`.
3. Set License (MIT / open source), Category (e.g. Tools Integration), Pricing (Free).
4. Submit → manual moderation (typically up to ~2 business days).

## Subsequent releases (automated)

Once the plugin exists in the catalogue:

```bash
# verify binary compatibility against the recommended IDE set
./gradlew verifyPlugin

# sign + publish the new version (needs the env vars above)
./gradlew publishPlugin
```

`publishPlugin` signs (when the signing env vars are present) and uploads to the
default (stable) channel. For pre-releases, publish to a separate channel and
have testers add the channel's plugin repository URL.

## Version bump

Edit `pluginVersion` in `intellij/gradle.properties`. Keep `pluginSinceBuild` /
`pluginUntilBuild` in step with `platformVersion`; widen `pluginUntilBuild` as new
IDEA majors are validated (see the comment in `gradle.properties`).
