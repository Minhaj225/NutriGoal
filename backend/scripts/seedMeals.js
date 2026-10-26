const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const { parseAndValidateMeals, importMeals } = require('../services/catalogueImport');
const { migrationUri, safeErrorMessage } = require('./migrationCli');

async function seedFromCsv(csv, { dryRun = false } = {}) {
  const { rows, errors } = parseAndValidateMeals({ csv });
  if (errors.length) {
    throw new Error(`CSV validation failed: ${errors.map(item => `row ${item.row}: ${item.message}`).join('; ')}`);
  }
  return importMeals(rows, { dryRun });
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(args = process.argv.slice(2)) {
  const uri = migrationUri(args);
  const file = option(args, '--file');
  if (!uri || !file) throw new Error('Usage: seedMeals --uri-env <name> --file <reviewed CSV> [--apply --confirm-db <name>]');
  const database = new URL(uri).pathname.slice(1);
  if (!database) throw new Error('Select an explicit database in the URI');
  const apply = args.includes('--apply');
  if (apply && option(args, '--confirm-db') !== database) throw new Error('Database confirmation does not match');
  const csv = await fs.readFile(path.resolve(file), 'utf8');
  const parsed = parseAndValidateMeals({ csv });
  if (parsed.errors.length) throw new Error(`CSV validation failed: ${parsed.errors.length} row error(s)`);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const result = await importMeals(parsed.rows, { dryRun: !apply });
    console.log(JSON.stringify({ database, ...result }));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}

module.exports = { seedFromCsv, main };
