import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const userSchema = new Schema(
  {
    avatar: {
      type: {
        url: String,
        localPath: String,
      },
      default: {
        url: `https://placehold.co/200x200`,
        localPath: "",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    lastLoginAt: {
      type: Date,
    },
    firstLogin: {
      type: Boolean,
      default: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    // Password is only mandatory for locally-created accounts. Google
    // sign-in accounts authenticate via verified Google ID tokens and carry
    // NO password at all — no fake hashes, no plaintext placeholders.
    password: {
      type: String,
      required: [
        function () {
          return this.authProvider !== "google";
        },
        "Password is required",
      ],
    },
    // Google Identity Services fields (populated only when a Google identity
    // is attached to the account — either at creation or via safe linking).
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    profileImage: {
      type: String,
      default: "",
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    refreshToken: {
      type: String,
    },
    forgotPasswordToken: {
      type: String,
    },
    forgotPasswordExpiry: {
      type: Date,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpiry: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.isPasswordCorrect = async function (password) {
  // Google-only accounts have no password hash: comparing against undefined
  // would make bcrypt throw (500) instead of cleanly rejecting credentials.
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      tokenVersion: this.tokenVersion,
    },
    process.env.ACCESS_TOKEN_SECRET || "default-secret-key",
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" },
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET || "default-refresh-secret",
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d" },
  );
};

userSchema.methods.generateTemporaryToken = function () {
    // Generate a 6-digit OTP
    const unHashedToken = crypto.randomInt(100000, 999999).toString();

    const hashedToken = crypto
        .createHash("sha256")
        .update(unHashedToken)
        .digest("hex")

    const tokenExpiry = Date.now() + (20*60*1000) // 20 mins
    return {unHashedToken, hashedToken, tokenExpiry}
};

export const User = mongoose.model("User", userSchema);
