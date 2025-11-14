const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = process.env.COOKIE_NAME || "token";

module.exports = async function requireAuth(req, res, next) {
  try {
    const token =
      (req.cookies && req.cookies[COOKIE_NAME]) ||
      (req.headers.authorization && req.headers.authorization.split(" ")[1]);

    if (!token) {
      return res.redirect("/auth/signin");
    }

    if (!JWT_SECRET) {
      console.error("JWT_SECRET not set in environment");
      return res.redirect("/auth/signin");
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.error("JWT verify error:", err && err.message);
      return res.redirect("/auth/signin");
    }

    const userId = payload.id || payload.sub || payload._id;
    if (!userId) {
      return res.redirect("/auth/signin");
    }

    const user = await User.findById(userId).select("-passwordHash").lean();
    if (!user) return res.redirect("/auth/signin");

    req.user = user;
    return next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.redirect("/auth/signin");
  }
};
