require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { connectDb } = require('./db');

async function startServer(port = process.env.PORT || 5001) {
  await app.locals.rateLimits.ready();
  await connectDb();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => resolve(server));
    server.once('error', reject);
  });
}

async function stopServer(server) {
  try {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  startServer().then(server => {
    console.log(`Server running on port ${server.address().port}`);
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => stopServer(server).then(() => process.exit(0), () => process.exit(1)));
    }
  }, () => {
    console.error('Required infrastructure unavailable; server did not start');
    process.exitCode = 1;
  });
}

module.exports = { startServer, stopServer };
