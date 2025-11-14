const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/authmiddleware");
const summaryController = require("../controllers/summaryController");

router.post("/summarize", requireAuth, summaryController.summarize);

router.get("/history", requireAuth, summaryController.listHistory);
router.get("/history/:id", requireAuth, summaryController.getSummary);
router.delete("/history/:id", requireAuth, summaryController.deleteSummary);
router.get("/recent", requireAuth, summaryController.listRecent);

module.exports = router;
