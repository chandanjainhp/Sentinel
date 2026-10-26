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

export function generateSiteApiKeySecret() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(32);
  let body = "";
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  return `sk_live_${body}`;
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
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
      index: true,
      default: null,
    },
    label: { type: String, trim: true, maxlength: 64, default: "Site key" },
    keyPrefix: {
      type: String,
      required: true,
      index: true,
    },
    prefix: { type: String, index: true },
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
    revokedAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

apiKeySchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    keyId: this.keyId,
    id: this._id.toString(),
    userId: this.userId,
    siteId: this.siteId?.toString?.() || null,
    name: this.name,
    keyPrefix: this.keyPrefix,
    prefix: this.prefix || this.keyPrefix,
    createdAt: this.createdAt,
    lastUsedAt: this.lastUsedAt,
  };
};

export const ApiKey = mongoose.model('ApiKey', apiKeySchema);
export default ApiKey;
