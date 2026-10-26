const fs = require('node:fs/promises');
const mongoose = require('mongoose');
const { auditCatalogue, applyCatalogueMigration } = require('../services/catalogueMigration');
const { option, migrationOptions, safeErrorMessage } = require('./migrationCli');

async function main(args = process.argv.slice(2)) {
  const { uri, database, apply, backupDir } = migrationOptions(args);
  const remapPath = option(args, '--remap-file');
  const remap = remapPath ? JSON.parse(await fs.readFile(remapPath, 'utf8')) : {};
  if (!remap || Array.isArray(remap) || typeof remap !== 'object' ||
      Object.entries(remap).some(([oldId, newId]) => !/^[a-f\d]{24}$/i.test(oldId) ||
        !/^[a-f\d]{24}$/i.test(newId))) throw new Error('Invalid ID remap file');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    if (apply) {
      const result = await applyCatalogueMigration({ backupDir, remap });
      console.log(JSON.stringify({ database, applied: true, ...result }));
    } else {
      const audit = await auditCatalogue(remap);
      console.log(JSON.stringify({ database, applied: false,
        meals: audit.meals.length, collisions: audit.collisions,
        identityConflicts: audit.identityConflicts,
        unresolved: audit.unresolved, feedbackCollisions: audit.feedbackCollisions,
        invalidRemap: audit.invalidRemap, unownedProfiles: audit.unownedProfiles }));
    }
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch(error => {
  console.error(safeErrorMessage(error));
  process.exitCode = 1;
});

module.exports = { main };
