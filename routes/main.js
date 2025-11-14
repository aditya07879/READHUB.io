const express = require("express");
const router = express.Router();
const summaryController = require("../controllers/summaryController");
const requireAuth = require("../middleware/authmiddleware");
const userController = require("../controllers/userController");
const contactController = require("../controllers/contactController");
const multer = require("multer");
const path = require("path");

const urlencoded = express.urlencoded({ extended: true });

const uploadDir = path.join(__dirname, "..", "tmp_uploads");
const fs = require("fs");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
});

router.post(
  "/contact",
  upload.single("attachment"),
  contactController.postContact
);

router.get("/", async (req, res, next) => {
  try {
    const Summary = require("../models/Summary");
    const filter = req.user ? { user: req.user._id } : {};

    const summaries = await Summary.find(filter)
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.render("home", { summaries, user: req.user || null });
  } catch (err) {
    next(err);
  }
});

router.get("/api/summarize-file", (req, res) => {
  res.render("summary");
});

router.get("/history", async (req, res, next) => {
  try {
    const filter = req.user ? { user: req.user._id } : {};

    const summaries = await require("../models/Summary")
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.render("history", { user: req.user || null, summaries });
  } catch (err) {
    next(err);
  }
});

router.get("/contact", (req, res) => {
  res.render("contact");
});

router.get("/pricing", (req, res, next) => {
  try {
    if (req.user && req.user.isSubscriber) {
      return res.render("pro-career-guide", { user: req.user });
    }
    return res.render("plan_dashboard", { user: req.user || null });
  } catch (err) {
    next(err);
  }
});

router.get("/profile", requireAuth, userController.getProfile);

router.get("/profile/edit", requireAuth, userController.getEditProfile);

router.post("/profile/edit", urlencoded, userController.postEditProfile);

router.get("/subscription/manage", requireAuth, async (req, res, next) => {
  try {
    return res.render("subscription_manage", {
      user: req.user || null,
      active: "billing",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/plan_partial", async (req, res) => {
  try {
    return res.render("plan_limit", { layout: false }, (err, html) => {
      if (err) {
        console.error("Error rendering plan_partial:", err && err.message);
        return res.status(500).send("Could not load plan partial");
      }
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    });
  } catch (err) {
    console.error("plan_partial unexpected error:", err && err.message);
    return res.status(500).send("Server error");
  }
});

router.get("/_test_nav", (req, res) => {
  res.render("partials/nav", { user: res.locals.user });
});

module.exports = router;
