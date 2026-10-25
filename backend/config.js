function getJwtSecret(secret = process.env.JWT_SECRET) {
  if (typeof secret !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(secret) ||
      Buffer.from(secret, 'base64').length < 32 ||
      Buffer.from(secret, 'base64').toString('base64') !== secret) {
    throw new Error('JWT_SECRET must be a base64-encoded random value of at least 32 bytes');
  }
  return secret;
}

module.exports = { getJwtSecret, jwtSecret: getJwtSecret() };
