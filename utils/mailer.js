const nodemailer = require("nodemailer");

const SMTP_HOST = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS?.trim();
let FROM_EMAIL = process.env.FROM_EMAIL?.trim() || SMTP_USER || "no-reply@yourapp.example";

if (!SMTP_USER || !SMTP_PASS) {
  console.warn(
    "[mailer] WARNING: SMTP_USER or SMTP_PASS missing. Emails will fail until env vars are configured."
  );
}


if (!process.env.FROM_EMAIL) {
  FROM_EMAIL = SMTP_USER;
}


const transportOptions = {
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, 
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
};


if (SMTP_PORT === 587) {
  transportOptions.requireTLS = true;
}

const transporter = nodemailer.createTransport(transportOptions);


transporter.verify().then(
  () => {
    console.log("[mailer] transporter verified. Ready to send emails.");
  },
  (err) => {

    console.error("[mailer] transporter verify failed:", err && err.message ? err.message : err);
    console.error(
      "[mailer] Common causes: invalid SMTP_USER/SMTP_PASS, need Google App Password, or Google blocked the sign-in."
    );
  }
);


function formatCurrency(value) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!isFinite(n)) return String(value);
  if (Number.isInteger(n) && Math.abs(n) > 1000) {
    return `₹${(n / 100).toFixed(2)}`;
  }
  return `₹${n.toFixed(2)}`;
}

function normalizeAmountToRupees(paymentInfo = {}) {
  if (!paymentInfo) return undefined;
  if (paymentInfo.amount !== undefined && paymentInfo.amount !== null) {
    const n = Number(paymentInfo.amount);
    if (isFinite(n)) return Number(n.toFixed(2));
  }
  if (paymentInfo.amountRupees !== undefined && paymentInfo.amountRupees !== null) {
    const n = Number(paymentInfo.amountRupees);
    if (isFinite(n)) return Number(n.toFixed(2));
  }
  const paiseCandidate =
    paymentInfo.amountPaise ??
    paymentInfo.paid_amount_paise ??
    paymentInfo.paidAmountPaise ??
    paymentInfo.paidAmount;
  if (paiseCandidate !== undefined && paiseCandidate !== null) {
    const p = Number(paiseCandidate);
    if (isFinite(p)) return Number((p / 100).toFixed(2));
  }
  if (
    paymentInfo.payment &&
    (paymentInfo.payment.amount ||
      (paymentInfo.payment.entity && paymentInfo.payment.entity.amount))
  ) {
    const p = Number(
      paymentInfo.payment.amount ||
        (paymentInfo.payment.entity && paymentInfo.payment.entity.amount) ||
        0
    );
    if (isFinite(p)) return Number((p / 100).toFixed(2));
  }
  return undefined;
}

/**
 * Send professional payment receipt email.
 * @param {object} user { email, fullname }
 * @param {object} paymentInfo { orderId, paymentId, amount?, amountPaise?, currency, method, createdAt, metadata }
 */
async function sendPaymentReceipt(user, paymentInfo = {}) {
  if (!user || !user.email) {
    throw new Error("sendPaymentReceipt: missing user or user.email");
  }

  const amountRupees = normalizeAmountToRupees(paymentInfo);
  const amountDisplay =
    amountRupees !== undefined && amountRupees !== null
      ? `₹${Number(amountRupees).toFixed(2)}`
      : paymentInfo.currency && paymentInfo.rawAmount
      ? `${paymentInfo.rawAmount} ${paymentInfo.currency}`
      : "—";

  const to = user.email;
  const name = user.fullname || (user.email ? user.email.split("@")[0] : "Customer");

  const html = `...`; 

  try {
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject: `Payment Receipt — ${paymentInfo.orderId || paymentInfo.paymentId || ""}`,
      html,
      replyTo: user.email,
    });
    return info;
  } catch (err) {
    console.error("[mailer] sendPaymentReceipt failed:", err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = { sendPaymentReceipt, transporter, FROM_EMAIL };
