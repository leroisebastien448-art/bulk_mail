const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Méthode non autorisée' });

  const { fromName, fromEmail, recipients, subject, body } = req.body;
  const apiKey = process.env.SENDGRID_API_KEY;

  if (!apiKey) return res.status(500).json({ success: false, message: 'Clé API SendGrid manquante' });
  if (!recipients || !recipients.length) return res.status(400).json({ success: false, message: 'Aucun destinataire' });
  if (!subject) return res.status(400).json({ success: false, message: 'Objet manquant' });
  if (!body) return res.status(400).json({ success: false, message: 'Message manquant' });

  const senderEmail = fromEmail || 'mail@cyberverifs.com';
  const senderName  = fromName  || 'CyberVerifs';
  const isHtml = /<[a-z][\s\S]*>/i.test(body);
  const results = [];

  for (const to of recipients) {
    try {
      const payload = JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from:     { email: senderEmail, name: senderName },
        reply_to: { email: senderEmail, name: senderName },
        subject:  subject,
        content:  [{ type: isHtml ? 'text/html' : 'text/plain', value: body }]
      });

      await new Promise((resolve) => {
        const options = {
          hostname: 'api.sendgrid.com',
          port: 443,
          path: '/v3/mail/send',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type':  'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        };
        const r = https.request(options, (resp) => {
          let data = '';
          resp.on('data', c => data += c);
          resp.on('end', () => {
            if (resp.statusCode >= 200 && resp.statusCode < 300) {
              results.push({ email: to, success: true, message: 'Envoyé' });
            } else {
              let msg = 'Erreur ' + resp.statusCode;
              try { const j = JSON.parse(data); if (j.errors?.[0]) msg = j.errors[0].message; } catch(e){}
              results.push({ email: to, success: false, message: msg });
            }
            resolve();
          });
        });
        r.on('error', e => { results.push({ email: to, success: false, message: e.message }); resolve(); });
        r.write(payload);
        r.end();
      });

      await new Promise(r => setTimeout(r, 200));
    } catch(e) {
      results.push({ email: to, success: false, message: e.message });
    }
  }

  const ok  = results.filter(r => r.success).length;
  const err = results.length - ok;
  return res.status(200).json({ success: true, results, total: results.length, ok, errors: err });
};
