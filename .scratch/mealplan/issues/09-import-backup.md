# 09: Import backup

**What to build:** In Settings the user picks a backup YAML file. The app parses it, validates the version and shape, asks for confirmation (it replaces everything), decodes images back to Blobs, and replaces all tables in one transaction. Invalid files show a clear error and leave existing data untouched.

**Blocked by:** 08 (Export backup)

**Status:** ready-for-agent

- [x] Wrong version or malformed file is rejected with a message; data is unchanged
- [x] Confirmation is required before replacing data
- [x] All tables are replaced atomically
- [x] Round-trip unit test: export → import restores all tables, including an image Blob byte-for-byte
- [x] Manual check: export, clear site data, import, everything (incl. images) is back
