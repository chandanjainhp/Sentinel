import crypto from 'crypto';
import mongoose from 'mongoose';

export function hashApiKeySecret(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Cryptographically secure secret. Format: sk_<8hex>_<48hex> */
export function generateApiKeySecret() {
  const prefix = crypto.randomBytes(4).toString('hex');
  const body = crypto.randomBytes(24).toString('hex');
  return `sk_${prefix}_${body}`;
}

export function apiKeyPrefixFromSecret(raw) {
  // sk_a1b2c3d4_… → sk_a1b2c3d4
  const parts = String(raw).split('_');
  if (parts.length >= 2) return `${parts[0]}_${parts[1]}`;
  return String(raw).slice(0, 12);
}

/**
 * ONE API key per user. The unique index on userId enforces the single-key rule;
 * generating a new key replaces the previous one.
 */
const apiKeySchema = new mongoose.Schema(
  {
    keyId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `key_${crypto.randomUUID()}`,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    keyPrefix: {
      type: String,
      required: true,
      index: true,
    },
    hashedSecret: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

apiKeySchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    keyId: this.keyId,
    id: this._id.toString(),
    userId: this.userId,
    keyPrefix: this.keyPrefix,
    createdAt: this.createdAt,
    lastUsedAt: this.lastUsedAt,
  };
};

export const ApiKey = mongoose.model('ApiKey', apiKeySchema);
export default ApiKey;
