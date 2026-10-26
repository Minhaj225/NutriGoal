const mongoose = require('mongoose');
const { migrateLegacyFeedback } = require('../services/catalogueMigration');
const { migrationOptions, safeErrorMessage } = require('./migrationCli');

async function main(args = process.argv.slice(2)) {
  const { uri, database, apply, backupDir } = migrationOptions(args);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const result = await migrateLegacyFeedback({ backupDir, dryRun: !apply });
    console.log(JSON.stringify({ database, applied: apply, ...result }));
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch(error => {
  console.error(safeErrorMessage(error));
  process.exitCode = 1;
});

module.exports = { main };
