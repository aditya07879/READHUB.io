const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

const providerSchema = new mongoose.Schema(
  {
    providerId: { type: String, required: true },
    providerName: { type: String, required: true },
    providerData: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    fullname: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, index: true },
    password: { type: String, select: false },

    passwordHash: { type: String, select: false },

    providers: { type: [providerSchema], default: [] },

    summaryCount: { type: Number, default: 0 },
    summaryResetAt: { type: Date, default: null },

    isSubscriber: { type: Boolean, default: false },
    plan: { type: String, default: "free" },
    planActivatedAt: { type: Date, default: null },

    lastPayment: {
      orderId: { type: String },
      paymentId: { type: String },
      amount: { type: Number },
      paidAt: { type: Date },
    },
  },
  { timestamps: true }
);

userSchema.index({ "providers.providerName": 1, "providers.providerId": 1 });

userSchema.methods.setPassword = async function (plain) {
  if (!plain) throw new Error("Password required");
  this.passwordHash = await bcrypt.hash(plain, SALT_ROUNDS);
};

userSchema.methods.verifyPassword = async function (plain) {
  if (!plain) return false;

  if (this.passwordHash) {
    const stored = this.passwordHash;
    if (typeof stored === "string" && /^\$2[aby]\$/.test(stored)) {
      return bcrypt.compare(plain, stored);
    }

    return plain === stored;
  }

  if (this.password) {
    const stored = this.password;
    if (typeof stored === "string" && /^\$2[aby]\$/.test(stored)) {
      return bcrypt.compare(plain, stored);
    }
    return plain === stored;
  }

  return false;
};

userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.passwordHash;

    if (ret.providers && Array.isArray(ret.providers)) {
      ret.providers = ret.providers.map((p) => ({
        providerName: p.providerName,
        providerId: p.providerId,
      }));
    }
    return ret;
  },
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
