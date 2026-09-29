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
 * API keys. A user may hold several named keys (e.g. one per gateway);
 * revocation deletes the document, which immediately invalidates the secret.
 */
const apiKeySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 64,
    },
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
    name: this.name,
    keyPrefix: this.keyPrefix,
    createdAt: this.createdAt,
    lastUsedAt: this.lastUsedAt,
  };
};

export const ApiKey = mongoose.model('ApiKey', apiKeySchema);
export default ApiKey;
