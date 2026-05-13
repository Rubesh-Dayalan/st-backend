const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ── 4 GoDaddy SMTP Senders ────────────────────────────────
const SENDERS = [
  { name: 'Srinithi',       email: 'srinithi@scopethinkers.in',        pass: process.env.SMTP1_PASS || 'r!51z19vC' },
  { name: 'Manoj',          email: 'manoj@scopethinkers.in',           pass: process.env.SMTP2_PASS || 'd0Q%6i65e' },
  { name: 'Mohan',          email: 'mohan@scopethinkers.in',           pass: process.env.SMTP3_PASS || 'pC74h~f83' },
  { name: 'Valliyappan',    email: 'valliyappan.t@scopethinkers.in',   pass: process.env.SMTP4_PASS || '?qiC543o6' },
];

let senderIndex = 0;
function getNextSender() {
  const s = SENDERS[senderIndex % SENDERS.length];
  senderIndex++;
  return s;
}

function makeTransporter(sender, attempt = 0) {
  const configs = [
    { host: 'smtpout.secureserver.net', port: 587, secure: false },
    { host: 'relay-hosting.secureserver.net', port: 25,  secure: false },
    { host: 'smtpout.secureserver.net', port: 465, secure: true  },
    { host: 'mail.scopethinkers.in',    port: 587, secure: false },
  ];
  const cfg = configs[attempt % configs.length];
  return nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.secure,
    auth: { user: sender.email, pass: sender.pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

// ── Health check ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Scope Thinkers Outreach API',
    senders: SENDERS.map(s => s.email),
    timestamp: new Date().toISOString()
  });
});

// ── Test all 4 senders ────────────────────────────────────
app.post('/test', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to email required' });

  const results = [];
  for (const sender of SENDERS) {
    try {
      const transporter = makeTransporter(sender);
      await transporter.verify();
      await transporter.sendMail({
        from: `"${sender.name} | Scope Thinkers" <${sender.email}>`,
        to,
        subject: `Test email from ${sender.name} — Scope Thinkers Platform`,
        text: `Hi Rubesh,\n\nThis is a test email from the Scope Thinkers autonomous outreach platform.\n\nSender: ${sender.name} (${sender.email})\nStatus: Working perfectly ✓\n\nAll systems are ready to send outreach emails!\n\nBest,\n${sender.name}\nScope Thinkers`
      });
      results.push({ sender: sender.email, status: 'sent', ok: true });
      console.log(`✓ Test sent from ${sender.email} to ${to}`);
    } catch (e) {
      results.push({ sender: sender.email, status: 'failed', error: e.message, ok: false });
      console.error(`✗ Failed from ${sender.email}:`, e.message);
    }
    // small delay between sends
    await new Promise(r => setTimeout(r, 1000));
  }
  res.json({ results, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length });
});

// ── Send single email (used by platform) ─────────────────
app.post('/send', async (req, res) => {
  const { to, toName, subject, body, senderOverride } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, body required' });

  const sender = senderOverride
    ? SENDERS.find(s => s.email === senderOverride) || getNextSender()
    : getNextSender();

  try {
    const transporter = makeTransporter(sender);
    await transporter.sendMail({
      from: `"${sender.name} | Scope Thinkers" <${sender.email}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      subject,
      text: body
    });
    console.log(`✓ Sent to ${to} via ${sender.email}`);
    res.json({ ok: true, sender: sender.email, senderName: sender.name });
  } catch (e) {
    console.error(`✗ Send failed:`, e.message);
    res.status(500).json({ ok: false, error: e.message, sender: sender.email });
  }
});

// ── Send bulk (array of emails) ───────────────────────────
app.post('/send-bulk', async (req, res) => {
  const { emails } = req.body; // [{ to, toName, subject, body }]
  if (!emails || !emails.length) return res.status(400).json({ error: 'emails array required' });

  res.json({ status: 'queued', count: emails.length });

  // Process in background
  (async () => {
    for (const mail of emails) {
      const sender = getNextSender();
      try {
        const transporter = makeTransporter(sender);
        await transporter.sendMail({
          from: `"${sender.name} | Scope Thinkers" <${sender.email}>`,
          to: mail.toName ? `"${mail.toName}" <${mail.to}>` : mail.to,
          subject: mail.subject,
          text: mail.body
        });
        console.log(`✓ Bulk: ${mail.to} via ${sender.email}`);
      } catch (e) {
        console.error(`✗ Bulk failed ${mail.to}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`Bulk send complete: ${emails.length} emails processed`);
  })();
});

// ── Verify SMTP connection ────────────────────────────────
app.get('/verify', async (req, res) => {
  const results = [];
  for (const sender of SENDERS) {
    try {
      const transporter = makeTransporter(sender);
      await transporter.verify();
      results.push({ email: sender.email, name: sender.name, status: 'connected', ok: true });
    } catch (e) {
      results.push({ email: sender.email, name: sender.name, status: 'failed', error: e.message, ok: false });
    }
  }
  res.json({ results, allOk: results.every(r => r.ok) });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Scope Thinkers SMTP API running on port ${PORT}`);
  console.log(`   Senders: ${SENDERS.map(s => s.email).join(', ')}\n`);
});
