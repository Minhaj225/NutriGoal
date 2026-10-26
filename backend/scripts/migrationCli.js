function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function migrationUri(args) {
  const uri = option(args, '--uri');
  const envName = option(args, '--uri-env');
  if (Boolean(uri) === Boolean(envName)) {
    throw new Error('Specify exactly one of --uri or --uri-env');
  }
  if (envName && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) {
    throw new Error('Invalid URI environment variable name');
  }
  return uri || process.env[envName];
}

function migrationOptions(args) {
  const uri = migrationUri(args);
  if (!uri) throw new Error('Specify a database URI with an explicit database; default mode is dry-run');
  let parsed;
  try { parsed = new URL(uri); }
  catch { throw new Error('Invalid database URI'); }
  const database = parsed.pathname.slice(1);
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) ||
      !/^[a-zA-Z0-9_-]+$/.test(database)) throw new Error('Select an explicit database in the URI');
  const apply = args.includes('--apply');
  const backupDir = option(args, '--backup-dir');
  if (apply && (option(args, '--confirm-db') !== database || !backupDir)) {
    throw new Error('Apply requires --confirm-db matching the URI and a new --backup-dir');
  }
  return { uri, database, apply, backupDir };
}

function safeErrorMessage(error) {
  return String(error?.message || error).replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[redacted database URI]');
}

module.exports = { option, migrationUri, migrationOptions, safeErrorMessage };
