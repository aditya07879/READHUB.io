const Summary = require("../models/Summary");
const User = require("../models/user");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = global.fetch || undefined;

const MAX_CHARS = 50000;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "models/text-bison-001";

const MAX_FREE_SUMMARIES = 2;
const QUOTA_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

let genClient = null;
let genModelHandle = null;
if (GEMINI_KEY) {
  try {
    genClient = new GoogleGenerativeAI(GEMINI_KEY);
    genModelHandle = genClient.getGenerativeModel({ model: GEMINI_MODEL });
  } catch (err) {
    console.warn(
      "Generative AI client init failed, will use fallback summarizer. err:",
      err && err.message
    );
    genClient = null;
    genModelHandle = null;
  }
}

function extractiveSummarize(text = "", mode = "concise") {
  if (!text) return "";
  const sentences = (typeof text === "string" &&
    text.match(/[^.!?]+[.!?]?/g)) || [String(text)];
  if (mode === "concise")
    return sentences
      .slice(0, 2)
      .map((s) => s.trim())
      .join(" ")
      .trim();
  if (mode === "detailed")
    return sentences
      .slice(0, 6)
      .map((s) => s.trim())
      .join(" ")
      .trim();
  if (mode === "bullet")
    return sentences
      .slice(0, 6)
      .map((s) => "- " + s.trim())
      .join("\n")
      .trim();
  if (mode === "technical")
    return sentences
      .slice(0, 4)
      .map((s) => s.trim())
      .join(" ")
      .trim();
  return sentences
    .slice(0, 3)
    .map((s) => s.trim())
    .join(" ")
    .trim();
}

function buildModePrompt(text, mode) {
  if (mode === "concise") {
    return `You are a helpful, factual summarizer. Produce a concise summary in 2-3 short sentences. Do not invent facts. Output only the summary.

Text:
${text}
`;
  }
  if (mode === "detailed") {
    return `You are a careful summarizer. Produce a detailed summary that includes the main points, sub-points, and a short conclusion. Use 5-8 sentences or short paragraphs. Do not invent facts. Output only the summary.

Text:
${text}
`;
  }
  if (mode === "bullet") {
    return `You are a concise summarizer. Produce a short list of important bullet points (4-8 items) that capture the key facts or takeaways from the text. Start each line with a hyphen. Do not invent facts. Output only the bullet list.

Text:
${text}
`;
  }
  if (mode === "technical") {
    return `You are an expert technical summarizer. Produce a technical summary focusing on mechanisms, assumptions, and key metrics where present. Use clear technical language and short paragraphs (3-6 sentences). Do not invent facts. Output only the technical summary.

Text:
${text}
`;
  }
  return `Summarize the following text in ${mode} style. Be concise and factual.

Text:
${text}
`;
}

function extractTextFromGenResponse(res) {
  try {
    if (!res) return "";
    if (res.response) {
      if (typeof res.response.text === "function")
        return res.response.text().trim();
      if (typeof res.response === "string") return res.response.trim();
      if (
        Array.isArray(res.response.output) &&
        res.response.output[0] &&
        res.response.output[0].content
      ) {
        const parts = res.response.output[0].content;
        return parts
          .map((p) => p.text || p)
          .join(" ")
          .trim();
      }
    }
    if (res.outputText) return String(res.outputText).trim();
    if (res.text) return String(res.text).trim();
    return String(res).slice(0, 20000).trim();
  } catch (e) {
    return String(res).slice(0, 20000).trim();
  }
}

async function tryGeminiSummarize(text, mode) {
  if (!genModelHandle) throw new Error("gemini_unavailable");

  const prompt = buildModePrompt(text, mode);
  const MAX_ATTEMPTS = 3;
  let attempt = 0;
  let lastErr = null;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    try {
      const genRes = await genModelHandle.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const rawOut = extractTextFromGenResponse(genRes);
      let out = rawOut || "";

      if (mode === "bullet") {
        const hasBullet =
          /^[\-\•\*]\s+/m.test(out) ||
          out.includes("\n-") ||
          out.includes("\n•");
        if (!hasBullet) {
          const sents = out.match(/[^.!?]+[.!?]?/g) || [out];
          out = sents
            .slice(0, Math.min(6, sents.length))
            .map((s) => "- " + s.trim())
            .join("\n");
        } else {
          out = out
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => l.replace(/^(\-|\*|•|\u2022)\s*/, "- "))
            .join("\n");
        }
      } else if (mode === "concise") {
        const sents = out.match(/[^.!?]+[.!?]?/g) || [out];
        out = sents.slice(0, 3).join(" ").trim();
      }

      out = (out || "").trim();
      if (!out) throw new Error("empty_response_from_model");
      return { text: out, raw: genRes };
    } catch (err) {
      lastErr = err;
      const status = err && err.status;
      if ([429, 502, 503, 504].includes(status)) {
        const backoff = 300 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      break;
    }
  }

  try {
    const base = "https://generativelanguage.googleapis.com/v1/models";
    const url = `${base}?key=${encodeURIComponent(GEMINI_KEY)}`;
    if (fetch) {
      const r = await fetch(url, { method: "GET" });
      lastErr = lastErr || {};
      lastErr.availableModels = await r.json().catch(() => null);
    }
  } catch (e) {}

  throw lastErr || new Error("gemini_failed");
}

exports.summarize = async (req, res) => {
  try {
    const { text = "", mode = "concise" } = req.body || {};

    const acceptsHtml =
      req.headers.accept && req.headers.accept.includes("html");

    if (!text || !String(text).trim()) {
      if (acceptsHtml)
        return res
          .status(400)
          .render("error", { message: "Text is required for summarization." });
      return res.status(400).json({ error: "text is required" });
    }

    if (req.user && req.user._id) {
      const now = new Date();

      let user = await User.findById(req.user._id).exec();
      if (!user) {
        if (acceptsHtml)
          return res.status(401).render("login", { message: "Please login" });
        return res.status(401).json({ error: "user not found" });
      }

      if (!user.isSubscriber) {
        if (!user.summaryResetAt || user.summaryResetAt <= now) {
          user.summaryCount = 0;
          user.summaryResetAt = new Date(now.getTime() + QUOTA_PERIOD_MS);
          await user.save();
        }

        const updated = await User.findOneAndUpdate(
          { _id: user._id, summaryCount: { $lt: MAX_FREE_SUMMARIES } },
          { $inc: { summaryCount: 1 } },
          { new: true }
        ).exec();

        if (!updated) {
          res.set("X-Limit-Reached", "true");
          res.set("Access-Control-Expose-Headers", "X-Limit-Reached");

          if (acceptsHtml) {
            return res.status(402).render("plan_limit", {
              title: "Upgrade required",
              message:
                "You have used your free summaries. Please upgrade to continue.",
            });
          }

          return res.status(402).json({
            ok: false,
            limitReached: true,
            message: "Free summary limit reached. Upgrade to continue.",
          });
        }
        user = updated;
      }
    }

    const safeText = String(text).slice(0, MAX_CHARS);
    const t0 = Date.now();

    let usedGemini = false;
    let summaryText = "";
    let modelError = null;

    if (genModelHandle) {
      try {
        const { text: gtext } = await tryGeminiSummarize(safeText, mode);
        summaryText = gtext;
        usedGemini = true;
      } catch (err) {
        modelError = {
          message: err && err.message ? err.message : "gemini_error",
          status: err && err.status ? err.status : null,
          availableModels:
            err && err.availableModels ? err.availableModels : null,
        };
        summaryText = extractiveSummarize(safeText, mode);
        usedGemini = false;
      }
    } else {
      summaryText = extractiveSummarize(safeText, mode);
      usedGemini = false;
    }

    const duration_ms = Date.now() - t0;

    try {
      const saved = await Summary.create({
        title: (summaryText || "").slice(0, 200),
        summaryText,
        originalText: safeText,
        mode: mode || "concise",
        user: req.user ? req.user._id : null,
        createdAt: new Date(),
        meta: {
          source: usedGemini ? "gemini" : "extractive-fallback",
          model: usedGemini ? GEMINI_MODEL : null,
        },
      });

      const payload = {
        ok: true,
        id: saved._id,
        summary: summaryText,
        mode,
        duration_ms,
        usedGemini,
      };
      if (modelError) payload.modelError = modelError;

      if (acceptsHtml) {
        try {
          return res.render("summary", { summary: summaryText, meta: payload });
        } catch (e) {
          return res.json(payload);
        }
      }

      return res.json(payload);
    } catch (dbErr) {
      console.error("Failed to persist summary:", dbErr && dbErr.message);
      const payload = {
        ok: true,
        id: null,
        summary: summaryText,
        mode,
        duration_ms,
        usedGemini,
        warning: "failed to persist summary",
      };
      if (modelError) payload.modelError = modelError;
      if (acceptsHtml) {
        try {
          return res.render("summary", { summary: summaryText, meta: payload });
        } catch (e) {
          return res.json(payload);
        }
      }
      return res.json(payload);
    }
  } catch (err) {
    console.error(
      "summarize handler unexpected error:",
      err && (err.stack || err.message)
    );
    if (req.headers.accept && req.headers.accept.includes("html")) {
      return res
        .status(500)
        .render("error", { message: "Internal server error" });
    }
    return res
      .status(500)
      .json({ error: "internal error", detail: err && err.message });
  }
};

exports.listHistory = async (req, res) => {
  try {
    if (!req.user || !req.user._id)
      return res.status(401).json({ error: "unauthorized" });

    const items = await Summary.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return res.json(items);
  } catch (err) {
    console.error("listHistory error:", err && err.message);
    return res.status(500).json({ error: "internal error" });
  }
};

exports.getSummary = async (req, res) => {
  try {
    if (!req.user || !req.user._id)
      return res.status(401).json({ error: "unauthorized" });

    const item = await Summary.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).lean();
    if (!item) return res.status(404).json({ error: "not found" });
    return res.json(item);
  } catch (err) {
    console.error("getSummary error:", err && err.message);
    return res.status(500).json({ error: "internal error" });
  }
};

exports.deleteSummary = async (req, res) => {
  try {
    if (!req.user || !req.user._id)
      return res.status(401).json({ error: "unauthorized" });

    const deleted = await Summary.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!deleted)
      return res.status(404).json({ error: "not found or not allowed" });
    return res.status(204).send();
  } catch (err) {
    console.error("deleteSummary error:", err && err.message);
    return res.status(500).json({ error: "internal error" });
  }
};

exports.listRecent = async (req, res) => {
  try {
    const limit = 10;
    if (req.user && req.user._id) {
      const items = await Summary.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      return res.json(items);
    }
    const items = await Summary.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json(items);
  } catch (err) {
    console.error("listRecent error:", err && err.message);
    return res.status(500).json({ error: "internal error" });
  }
};
