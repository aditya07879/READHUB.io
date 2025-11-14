const User = require("../models/user");
const Summary = require("../models/Summary");

const MAX_FREE_SUMMARIES = 2;

async function getProfile(req, res, next) {
  try {
    if (!req.user || !req.user._id) return res.redirect("/auth/signin");

    const userId = req.user._id;
    const userDoc = await User.findById(userId).lean();
    if (!userDoc)
      return res.status(404).render("error", { message: "User not found" });

    const history = await Summary.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const summariesCount = history.length;
    const wordsSummarized = history.reduce((acc, item) => {
      const txt = item.originalText || item.summaryText || "";
      const wc = String(txt).trim()
        ? String(txt).split(/\s+/).filter(Boolean).length
        : 0;
      return acc + wc;
    }, 0);

    const summaryCount =
      typeof userDoc.summaryCount === "number" ? userDoc.summaryCount : 0;
    const summaryResetAt = userDoc.summaryResetAt || null;
    const dailyLeft = userDoc.isSubscriber
      ? Infinity
      : Math.max(0, MAX_FREE_SUMMARIES - summaryCount);

    const subscription = userDoc.subscription || {
      planName: userDoc.plan || (userDoc.isSubscriber ? "Pro" : "Free"),
      renewalDate:
        userDoc.subscription && userDoc.subscription.renewalDate
          ? userDoc.subscription.renewalDate
          : userDoc.planActivatedAt || null,
    };

    const payloadUser = {
      _id: userDoc._id,
      fullname: userDoc.fullname || userDoc.name || "",
      email: userDoc.email || "",
      profileImageURL: userDoc.profileImageURL || userDoc.avatar || "",
      createdAt: userDoc.createdAt || userDoc.created_at || null,
      isSubscriber: !!userDoc.isSubscriber,
      history: history.map((h) => ({
        _id: h._id,
        title: h.title || (h.summaryText || "").slice(0, 120),
        createdAt: h.createdAt,
        text: h.originalText,
      })),
      stats: {
        summariesCount,
        wordsSummarized,
      },
      quota: {
        dailyLeft: dailyLeft === Infinity ? "Unlimited" : dailyLeft,
        charsLeft:
          typeof userDoc.charsLeft === "number" ? userDoc.charsLeft : 20000,
        resetTime: summaryResetAt,
      },
      subscription: subscription,
      devices: Array.isArray(userDoc.devices) ? userDoc.devices : [],
      uploads: Array.isArray(userDoc.uploads) ? userDoc.uploads : [],
    };

    return res.render("profile", { user: payloadUser });
  } catch (err) {
    console.error(
      "[userController.getProfile] error",
      err && err.stack ? err.stack : err
    );
    return next(err);
  }
}

async function getEditProfile(req, res, next) {
  try {
    if (!req.user || !req.user._id) return res.redirect("/auth/signin");

    const userId = req.user._id;
    const userDoc = await User.findById(userId).lean();
    if (!userDoc)
      return res.status(404).render("error", { message: "User not found" });

    const payloadUser = {
      _id: userDoc._id,
      fullname: userDoc.fullname || "",
      email: userDoc.email || "",
      profileImageURL: userDoc.profileImageURL || "",
    };

    return res.render("edit_profile", {
      user: payloadUser,
      error: null,
      success: null,
    });
  } catch (err) {
    console.error(
      "[userController.getEditProfile] error",
      err && err.stack ? err.stack : err
    );
    return next(err);
  }
}

async function postEditProfile(req, res, next) {
  try {
    if (!req.user || !req.user._id) return res.redirect("/auth/signin");

    const userId = req.user._id;
    const { fullname, email, profileImageURL } = req.body || {};

    if (!fullname || !email) {
      return res.render("edit_profile", {
        user: { fullname, email, profileImageURL },
        error: "Full name and email are required.",
        success: null,
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: userId },
    }).lean();
    if (existing) {
      return res.render("edit_profile", {
        user: { fullname, email, profileImageURL },
        error: "Email is already in use by another account.",
        success: null,
      });
    }

    const update = {
      fullname: String(fullname).trim(),
      email: normalizedEmail,
    };
    if (typeof profileImageURL === "string" && profileImageURL.trim()) {
      update.profileImageURL = profileImageURL.trim();
    } else {
      update.profileImageURL = "";
    }

    await User.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true }
    ).exec();

    return res.redirect("/profile");
  } catch (err) {
    console.error(
      "[userController.postEditProfile] error",
      err && err.stack ? err.stack : err
    );

    return res.render("edit_profile", {
      user: req.body || {},
      error: "Update failed. Try again.",
      success: null,
    });
  }
}

module.exports = {
  getProfile,
  getEditProfile,
  postEditProfile,
};
