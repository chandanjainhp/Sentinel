// One-time migration: drop the legacy unique userId_1 index on apikeys
// so users can hold multiple named keys (new schema has no unique userId).
import fs from 'fs';
import mongoose from 'mongoose';

const env = fs.readFileSync('/home/chandanjainhp/coding/javascript/Project/Sentinel/server/.env', 'utf8');
const uri = env.match(/^MONGODB_URL=(.+)$/m)?.[1]?.trim();
if (!uri) { console.error('MONGODB_URL not found'); process.exit(1); }

await mongoose.connect(uri);
const col = mongoose.connection.collection('apikeys');
const indexes = await col.indexes();
console.log('before:', indexes.map((i) => i.name).join(', '));
if (indexes.some((i) => i.name === 'userId_1')) {
  await col.dropIndex('userId_1');
  console.log('dropped: userId_1');
} else {
  console.log('userId_1 not present — nothing to do');
}
console.log('after:', (await col.indexes()).map((i) => i.name).join(', '));
await mongoose.disconnect();
