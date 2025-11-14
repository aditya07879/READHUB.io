const User = require("../models/user");

async function findOrCreateOAuthUser(input) {
  if (!input) {
    const err = new Error("OAuth input missing (null/undefined).");
    err.code = "NO_OAUTH_INPUT";
    throw err;
  }

  let provider = null;
  let providerId = null;
  let email = null;
  let fullname = null;
  let raw = null;

  if (
    typeof input === "object" &&
    (input.provider ||
      input.providerId ||
      input.email ||
      input.fullname ||
      input.id)
  ) {
    provider = input.provider || input.providerName || null;
    providerId = input.providerId || input.id || null;
    email = input.email || null;
    fullname = input.fullname || null;
    raw = input.raw || input;
  } else {
    const profile = input;
    raw = profile;
    provider =
      profile.provider || (profile._json && profile._json.provider) || null;
    providerId =
      profile.id ||
      (profile._json && (profile._json.id || profile._json.sub)) ||
      null;

    if (
      profile.emails &&
      Array.isArray(profile.emails) &&
      profile.emails.length
    ) {
      const e = profile.emails[0];
      email = typeof e === "string" ? e : e.value || e.email || null;
    } else {
      email =
        profile.email ||
        (profile._json && (profile._json.email || profile._json.mail)) ||
        null;
    }

    fullname =
      profile.displayName ||
      (profile.name &&
        (
          (profile.name.givenName || "") +
          " " +
          (profile.name.familyName || "")
        ).trim()) ||
      null;
  }

  if (email) email = String(email).toLowerCase().trim();
  provider = provider ? String(provider) : null;
  providerId = providerId ? String(providerId) : null;

  try {
    if (provider && providerId) {
      const userByProvider = await User.findOne({
        "providers.providerName": provider,
        "providers.providerId": providerId,
      }).exec();
      if (userByProvider) return userByProvider;
    }

    if (email) {
      const userByEmail = await User.findOne({ email }).exec();
      if (userByEmail) {
        userByEmail.providers = Array.isArray(userByEmail.providers)
          ? userByEmail.providers
          : [];
        const exists = userByEmail.providers.some(
          (p) =>
            String(p.providerName || p.provider || "").toLowerCase() ===
              String(provider || "").toLowerCase() &&
            String(p.providerId || p.id || "") === String(providerId || "")
        );
        if (provider && providerId && !exists) {
          userByEmail.providers.push({
            providerName: provider,
            providerId: providerId,
            providerData: raw || {},
          });
          if (!userByEmail.fullname && fullname)
            userByEmail.fullname = fullname;
          await userByEmail.save();
        }
        return userByEmail;
      }
    }

    const newUser = new User({
      fullname: fullname || (email ? email.split("@")[0] : "OAuth User"),
      email: email || undefined,
      providers: [],
    });

    if (provider && providerId) {
      newUser.providers.push({
        providerName: provider,
        providerId: providerId,
        providerData: raw || {},
      });
    }

    if (raw && raw.photos && Array.isArray(raw.photos) && raw.photos[0]) {
      const p = raw.photos[0];
      newUser.profileImageURL =
        (typeof p === "string" ? p : p.value || p.url) ||
        newUser.profileImageURL;
    } else if (raw && raw._json && (raw._json.picture || raw._json.avatar)) {
      newUser.profileImageURL = raw._json.picture || raw._json.avatar;
    }

    await newUser.save();
    return newUser;
  } catch (err) {
    throw err;
  }
}

module.exports = findOrCreateOAuthUser;
