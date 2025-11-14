const fs = require('fs');
const { transporter } = require('../utils/mailer'); // 

async function postContact(req, res, next) {
  try {
    const { name, email, topic, message, priority } = req.body || {};
    const isPriority = priority === 'pro' || req.user?.isSubscriber;

    if (!name || !email || !message) {
      if (req.headers.accept && req.headers.accept.includes('html')) {
        return res.status(400).render('contact', { error: 'Name, email and message are required.', user: req.user || null });
      }
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    const to = process.env.SUPPORT_EMAIL || process.env.FROM_EMAIL || null;
    if (!to) {
      console.error('[contactController] SUPPORT_EMAIL not configured');
      if (req.headers.accept && req.headers.accept.includes('html')) {
        return res.status(500).render('contact', { error: 'Server not configured to send email.', user: req.user || null });
      }
      return res.status(500).json({ ok: false, error: 'no_recipient_configured' });
    }

    const subject = `[Contact] ${topic || 'General'} — ${name}`;
    const text = [
      `From: ${name} <${email}>`,
      `Priority: ${isPriority ? 'HIGH' : 'normal'}`,
      '',
      `Message:`,
      message,
      '',
      `Sent at: ${new Date().toISOString()}`
    ].join('\n');

    const mailOptions = {
      from: `"${name}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to,
      replyTo: email,
      subject,
      text
    };

    if (req.file && req.file.path && req.file.originalname) {
      mailOptions.attachments = [{
        filename: req.file.originalname,
        path: req.file.path
      }];
    }

    await transporter.sendMail(mailOptions);

    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }

    if (req.headers.accept && req.headers.accept.includes('html')) {
      return res.render('contact', { success: 'Message sent. We will reply shortly.', user: req.user || null });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[contactController] error', err && (err.stack || err.message));
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    if (req.headers.accept && req.headers.accept.includes('html')) {
      return res.status(500).render('contact', { error: 'Failed to send message. Try again later.', user: req.user || null });
    }
    return res.status(500).json({ ok: false, error: 'mail_failed' });
  }
}

module.exports = { postContact };
