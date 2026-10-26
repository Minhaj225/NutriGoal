const mongoose = require('mongoose');
const { verifyBackup, restoreBackup } = require('../services/catalogueMigration');
const { migrationOptions, safeErrorMessage } = require('./migrationCli');

async function main(args = process.argv.slice(2)) {
  const { uri, database, apply, backupDir } = migrationOptions(args);
  if (!backupDir) throw new Error('Specify --backup-dir to verify the saved backup');
  const backup = await verifyBackup(backupDir);
  if (!apply) {
    console.log(JSON.stringify({ database, applied: false, sourceDatabase: backup.database,
      counts: backup.counts, sha256: backup.sha256 }));
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const result = await restoreBackup(backupDir);
    console.log(JSON.stringify({ database, applied: true, ...result }));
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch(error => {
  console.error(safeErrorMessage(error));
  process.exitCode = 1;
});

module.exports = { main };
