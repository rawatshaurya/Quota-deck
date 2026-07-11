# GitHub publication checklist

## Repository

1. Create a new GitHub repository named `quota-deck`.
2. Extract `QuotaDeck-0.2.0-source.zip`.
3. Commit the extracted project files to the repository.
4. Confirm that `.env`, `dist/`, local logs, and runtime configuration are not committed.
5. Tag the release commit as `v0.2.0`.

## GitHub Release

1. Create a release from tag `v0.2.0`.
2. Use the title `Quota Deck v0.2.0 — Public Alpha`.
3. Paste the contents of `GITHUB_RELEASE.md` into the release description.
4. Attach `QuotaDeck-0.2.0-win-x64.zip`.
5. Attach `SHA256SUMS.txt`.
6. Mark it as a pre-release because this is an unsigned public alpha.
7. Publish the release and copy its public URL.

## LinkedIn

1. Open `LINKEDIN_LAUNCH_POST.md`.
2. Replace `[INSERT GITHUB RELEASE LINK]` with the published release URL.
3. Add a dashboard image or short phone/tablet video if available.
4. Paste the post into LinkedIn and publish.

Do not upload the outer GitHub Release Kit ZIP as the end-user download. It is the publisher handoff bundle. End users should download the Windows x64 ZIP directly.
