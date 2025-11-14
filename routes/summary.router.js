const express = require("express");
const router = express.Router();
const controller = require("../controllers/summaryController");
const requireAuth = require("../middleware/authmiddleware");

router.post("/summarize", requireAuth, controller.summarize);

router.get("/history", requireAuth, controller.listHistory);

router.get("/history/:id", requireAuth, controller.getSummary);

router.delete("/history/:id", requireAuth, controller.deleteSummary);

module.exports = router;
