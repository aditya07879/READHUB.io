const express = require("express");
const passport = require("passport");
const router = express.Router();
const authController = require("../controllers/authController");

router.get("/signup", (req, res) => res.render("signup", { error: null }));
router.get("/signin", (req, res) => res.render("login", { error: null }));

router.post("/signup", authController.signup);
router.post("/login", authController.login);

router.post("/logout", authController.logout);

router.get("/logout", authController.logout);

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/signin",
    session: false,
  }),
  authController.oauthCallback
);

router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"], session: false })
);
router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: "/auth/signin",
    session: false,
  }),
  authController.oauthCallback
);

module.exports = router;
