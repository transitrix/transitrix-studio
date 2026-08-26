### Fixed

- **Closing the Compliance Impact Matrix no longer reopens it immediately.** Auto-open treated the YAML becoming active again (the usual result of closing the webview) as a fresh file open. The matrix now opens beside the view-config file, and auto-open skips that same document until you switch away and back or reopen the tab. The toolbar Preview command is unchanged.
