# BetterBW

A streamlined **command-line interface** around Bitwarden's `bw` CLI.

```sh
npm install
npm start
```

Or install the local command once:

```sh
npm link
betterbw
```

Requires Node.js 22+ and `bw` on PATH. Uses your existing Bitwarden CLI account and server configuration. Override the CLI path with `BETTERBW_CLI=/path/to/bw`.

Enter your master password in the masked prompt. Choose Search all items and type to filter by account name, username, or website. Use arrow keys and Enter to select. Press Esc in account search to return to the vault menu. View account details, explicitly reveal a password, copy credentials, or go back. Favorites, folders, categories, sync, and locking are available from the main menu. Ctrl+C exits and locks application access.

Passwords are hidden by default. Secrets are shown only when selected, then hidden again when you press Enter. The app uses the terminal's alternate screen so revealed values are removed from the visible screen on return or exit. Clipboard copying uses xclip on X11 or wl-clipboard on Wayland, and clears after 30 seconds if unchanged, or on lock/exit. Waiting at a prompt for five minutes locks the app.

The master password is passed directly to `bw` through `--passwordenv`, never as a command argument or saved by BetterBW. Session keys remain in memory. Protected items require password verification. The CLI keeps its own encrypted vault cache; BetterBW does not save decrypted items. Locking drops this wrapper's access without invalidating other CLI sessions.

For new accounts the app supports email/password login and authenticator, email, or YubiKey codes. Set EU/US/self-hosted servers using `bw config server <url>` first. For SSO or API keys, sign in with `bw` first. This wrapper browses existing entries; create/edit entries and download attachments in Bitwarden's official clients.

```sh
npm run check
npm test
```

Tests use synthetic accounts and a fake CLI, not your real passwords.
