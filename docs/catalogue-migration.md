# Catalogue migration and rollback

Run these commands from `backend/` during a write-paused maintenance window. Use a replica set: catalogue remaps and feedback migration use MongoDB transactions. Test the full sequence on an isolated copy before touching a live database. None of these commands uses `backend/.env` implicitly.

## Review the source file

The importer accepts a reviewed CSV with explicit `cuisine` and `category` values from the app taxonomy. Give each source row a stable `source` and `externalId`, and retain its original category in `sourceCategory`. The sample at `backend/fixtures/sample-meals.csv` demonstrates the format; it is one example row, not a curated version of the 98-row ML dataset. That dataset has categories outside the app taxonomy. Review each row and map it deliberately before import. Do not map unknown categories to Main Dish. Empty allergen lists mean **unknown** unless a curator explicitly verifies them.

## Rehearse and apply

Set `MIGRATION_URI` in your shell to a URI with the exact database name, then avoid writing it in command arguments or logs. For a local single-node replica set reached through a mapped port, include `?directConnection=true`. Keep backup directories outside the repository, private to the operator. Replace `catalogue_db` and the backup paths below with the selected database and new paths.

```bash
npm run migrate:catalogue -- --uri-env MIGRATION_URI
npm run migrate:feedback -- --uri-env MIGRATION_URI
npm run seed -- --uri-env MIGRATION_URI --file fixtures/sample-meals.csv
```

Review the catalogue report's `collisions`, `identityConflicts`, `unresolved`, `feedbackCollisions`, and `unownedProfiles`. `identityConflicts` reports equal names with different canonical identities; the tool does not merge them. A collision needs a reviewed JSON file mapping each duplicate meal ObjectId to the single retained ObjectId, for example `{"old24hex":"kept24hex"}`. Investigate conflicting nutrition and existing references before choosing the retained record. Unowned profiles stay unowned; a matching email is not proof of account ownership.

For each apply, choose a **new** backup directory. The script writes `backup.ejson` and `manifest.json` with private permissions, original IDs and counts, catalogue keys, and a SHA-256 hash. It refuses an existing directory. Copy these files to the secured migration record before continuing.

```bash
npm run migrate:catalogue -- --uri-env MIGRATION_URI --remap-file reviewed-remap.json --apply --confirm-db catalogue_db --backup-dir /private/backup-catalogue-1
npm run migrate:feedback -- --uri-env MIGRATION_URI --apply --confirm-db catalogue_db --backup-dir /private/backup-feedback-1
npm run seed -- --uri-env MIGRATION_URI --file fixtures/sample-meals.csv --apply --confirm-db catalogue_db
```

Run both migration dry runs again. They should show no unresolved collisions or pending legacy feedback. Seed the same reviewed CSV again; it should report unchanged rows and preserve meal IDs. Compare meal/profile/feedback counts, remapped references, the archive, and rating sums with the manifests. The importer creates or updates catalogue data, but never resets feedback or deletes the collection.

Legacy meal aggregates are saved in the backup and on surviving meals as `legacyRatingSummary`; public counters restart from authenticated version-2 feedback. Duplicate originals are saved in `legacyMealArchive`. Only the latest dated feedback for an already owned profile is carried into `MealFeedback`, marked `legacy_unverified` with its original timestamp. It has no invented star rating and must be excluded from behavioral training. Old profile history remains readable. Do not link an unowned profile by email alone.

## Restore rehearsal

Verify the backup checksum and inspect its manifest first. Restore only into a **new, empty, isolated database**; the restore script rejects any target with records in its affected collections. It removes the migration's full catalogue-key index if the original backup predates that index. Never restore directly over a live database.

```bash
npm run restore:catalogue -- --uri-env MIGRATION_URI --backup-dir /private/backup-catalogue-1
npm run restore:catalogue -- --uri-env MIGRATION_URI --backup-dir /private/backup-catalogue-1 --apply --confirm-db isolated_restore_db
```

For the second command, `MIGRATION_URI` must select `isolated_restore_db`. Compare IDs, counts, and sample records with the saved manifest. A live rollback requires pausing writes, restoring into a separate database, verifying it, then switching the application connection. Keep the previous safe application build; do not run the old destructive seeder or reopen anonymous writes. Index creation follows the data transaction and can fail separately, so inspect the report and saved backup before retrying. The scripts never prove a production migration happened merely because local tests passed.
