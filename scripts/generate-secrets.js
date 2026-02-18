#!/usr/bin/env node

const crypto = require('crypto');

function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

console.log('🔐 Generated Secrets for Production:\n');
console.log('Copy these to your .env file:\n');
console.log(`JWT_SECRET=${generateSecret(32)}`);
console.log(`SESSION_SECRET=${generateSecret(32)}`);
console.log(`MASTER_ENCRYPTION_KEY=${generateSecret(32)}`);
console.log(`DB_PASSWORD=${generateSecret(16)}`);
console.log(`REDIS_PASSWORD=${generateSecret(16)}`);
console.log('\n⚠️  IMPORTANT: Store these securely and never commit them to git!');
