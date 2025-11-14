const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const User = require("../models/user");
const mongoose = require("mongoose");

const { sendPaymentReceipt } = (() => {
  try {
    return require("../utils/mailer");
  } catch (e) {
    return { sendPaymentReceipt: null };
  }
})();

const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
  console.warn(
    "[payments] Razorpay keys not set in env. create-order will fail."
  );
}

const rzp = new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET });

function paiseToRupees(paise) {
  const n = Number(paise);
  if (!isFinite(n)) return undefined;
  return Number((n / 100).toFixed(2));
}

router.post("/create-order", async (req, res) => {
  try {
    const userId = req.user ? String(req.user._id) : null;
    if (!userId)
      return res.status(401).json({ ok: false, error: "login required" });

    const { planId, amount, planName, period } = req.body;
    if (!planId || amount === undefined || amount === null) {
      return res
        .status(400)
        .json({ ok: false, error: "planId and amount required" });
    }

    const amountNum = Number(amount);
    if (!isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ ok: false, error: "invalid amount" });
    }

    const amountPaise = Math.round(amountNum * 100);

    const options = {
      amount: amountPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}_${userId.slice(-6)}`,
      notes: {
        userId: String(userId),
        planId: String(planId || ""),
        planName: String(planName || ""),
        period: String(period || "one-time"),
      },
    };

    const order = await rzp.orders.create(options);
    return res.json({ ok: true, order, key: RZP_KEY_ID });
  } catch (err) {
    console.error("[payments:create-order] error", (err && err.message) || err);
    return res.status(500).json({ ok: false, error: "create_order_failed" });
  }
});

router.post("/verify", express.json(), async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      planId,
      planName,
      period,
      amountPaise,
    } = req.body;

    const userId = req.user ? String(req.user._id) : null;
    if (!userId)
      return res.status(401).json({ ok: false, error: "login required" });

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res
        .status(400)
        .json({ ok: false, error: "missing payment identifiers" });
    }

    const expected = crypto
      .createHmac("sha256", String(RZP_KEY_SECRET || ""))
      .update(String(razorpay_order_id) + "|" + String(razorpay_payment_id))
      .digest("hex");

    const sigBuf = Buffer.from(String(razorpay_signature), "utf8");
    const expBuf = Buffer.from(String(expected), "utf8");
    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      return res.status(400).json({ ok: false, error: "invalid signature" });
    }

 
    const update = {
      isSubscriber: true,
      plan: planId || planName || "paid",
      planActivatedAt: new Date(),
      planPeriod: period || "one-time",
      "lastPayment.orderId": razorpay_order_id,
      "lastPayment.paymentId": razorpay_payment_id,
      "lastPayment.paidAt": new Date(),
    };

    let amountRupees;
    if (amountPaise !== undefined && amountPaise !== null) {
      const maybe = paiseToRupees(amountPaise);
      if (maybe !== undefined) {
        amountRupees = maybe;
        update["lastPayment.amount"] = amountRupees;
      }
    }

    try {
      await User.findByIdAndUpdate(userId, { $set: update }).exec();
    } catch (e) {
      console.error(
        "[payments:verify] update user failed",
        (e && e.message) || e
      );
    }

    const paymentInfo = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      amount: amountRupees !== undefined ? amountRupees : undefined,
      currency: "INR",
      method: req.body.method || "Online",
      createdAt: new Date(),
      metadata: { planId, planName, period },
    };

    (async () => {
      try {
        if (typeof sendPaymentReceipt === "function") {
          const user = await User.findById(userId).lean();
          if (user && user.email) {
            await sendPaymentReceipt(user, paymentInfo);
          }
        }
      } catch (mailErr) {
        console.error(
          "[payments:verify] sendPaymentReceipt failed",
          (mailErr && mailErr.message) || mailErr
        );
      }
    })();

    return res.json({ ok: true });
  } catch (err) {
    console.error("[payments:verify] error", (err && err.message) || err);
    return res.status(500).json({ ok: false, error: "verify_failed" });
  }
});

router.post("/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const payloadBuf = req.body;

    if (!WEBHOOK_SECRET) {
      console.warn(
        "[payments:webhook] No webhook secret configured; rejecting webhook."
      );
      return res.status(400).send("webhook_secret_not_set");
    }

    const expected = crypto
      .createHmac("sha256", String(WEBHOOK_SECRET))
      .update(payloadBuf)
      .digest("hex");

    const sigBuf = Buffer.from(String(signature || ""), "utf8");
    const expBuf = Buffer.from(String(expected || ""), "utf8");

    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      console.warn("[payments:webhook] signature mismatch");
      return res.status(400).send("invalid signature");
    }

    let event;
    try {
      event = JSON.parse(payloadBuf.toString("utf8"));
    } catch (e) {
      console.error(
        "[payments:webhook] invalid json payload",
        (e && e.message) || e
      );
      return res.status(400).send("invalid_payload");
    }

    if (
      event.event === "payment.captured" ||
      event.event === "order.paid" ||
      event.event === "payment.authorized"
    ) {
      const paymentEntity =
        (event.payload &&
          event.payload.payment &&
          event.payload.payment.entity) ||
        (event.payload && event.payload.payment_entity) ||
        null;
      const orderEntity =
        (event.payload && event.payload.order && event.payload.order.entity) ||
        (event.payload && event.payload.order_entity) ||
        null;

      const payment = paymentEntity || {};
      const order = orderEntity || {};
      const notes = (order && order.notes) || (payment && payment.notes) || {};

      const userId = notes.userId || null;
      const planId = notes.planId || notes.plan || null;
      const planName = notes.planName || null;
      const period = notes.period || null;

      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        try {
          let paidAmountRupees;
          const paymentAmountPaise =
            (payment &&
              (payment.amount || (payment.entity && payment.entity.amount))) ||
            undefined;
          const orderAmountPaise =
            (order &&
              (order.amount || (order.entity && order.entity.amount))) ||
            undefined;

          if (paymentAmountPaise !== undefined) {
            const maybe = paiseToRupees(paymentAmountPaise);
            if (maybe !== undefined) paidAmountRupees = maybe;
          } else if (orderAmountPaise !== undefined) {
            const maybe = paiseToRupees(orderAmountPaise);
            if (maybe !== undefined) paidAmountRupees = maybe;
          }

          const update = {
            isSubscriber: true,
            plan: planId || planName || "paid",
            planActivatedAt: new Date(),
            planPeriod: period || "one-time",
            "lastPayment.orderId":
              (order && (order.id || (order.entity && order.entity.id))) ||
              undefined,
            "lastPayment.paymentId":
              (payment &&
                (payment.id || (payment.entity && payment.entity.id))) ||
              undefined,
            "lastPayment.paidAt": new Date(),
          };
          if (paidAmountRupees !== undefined)
            update["lastPayment.amount"] = paidAmountRupees;

          await User.findByIdAndUpdate(userId, { $set: update }).exec();

          const paymentInfo = {
            orderId: update["lastPayment.orderId"],
            paymentId: update["lastPayment.paymentId"],
            amount:
              paidAmountRupees !== undefined ? paidAmountRupees : undefined,
            currency: (payment && payment.currency) || "INR",
            method: (payment && payment.method) || undefined,
            createdAt: new Date(),
            metadata: notes || {},
          };

          (async () => {
            try {
              if (typeof sendPaymentReceipt === "function") {
                const user = await User.findById(userId).lean();
                if (user && user.email) {
                  await sendPaymentReceipt(user, paymentInfo);
                }
              }
            } catch (mailErr) {
              console.error(
                "[payments:webhook] sendPaymentReceipt failed",
                (mailErr && mailErr.message) || mailErr
              );
            }
          })();
        } catch (e) {
          console.error(
            "[payments:webhook] failed to update user",
            (e && e.message) || e
          );
        }
      } else {
        console.warn(
          "[payments:webhook] no userId found in notes; skipping user update",
          { notes: notes || {} }
        );
      }
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error(
      "[payments:webhook] processing error",
      (err && err.message) || err
    );
    return res.status(500).send("error");
  }
});

module.exports = router;
