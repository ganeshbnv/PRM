import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import router from './routes/index';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { ensureSuperAdmin } from './services/users';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Ensure ganesh.bandi@globalhealthx.co always has admin role
ensureSuperAdmin();

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);   // auth + admin checks inside the router
app.use('/api', requireAuth, router);

// ── Password reset page (server-rendered, no Vite dependency) ─────────────────
app.get('/reset-password', (req, res) => {
  const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reset Password · Healix Engage</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}
    .logo{text-align:center;margin-bottom:32px}
    .logo-icon{display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:18px;background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.3);margin-bottom:12px}
    .logo-letter{font-size:28px;font-weight:900;color:#818cf8}
    .logo-name{font-size:24px;font-weight:700;color:#fff;letter-spacing:-.5px}
    .card{width:100%;max-width:400px;background:#1e293b;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:36px;box-shadow:0 24px 48px rgba(0,0,0,.5)}
    h2{font-size:20px;font-weight:700;color:#fff;margin-bottom:6px}
    .sub{font-size:13px;color:#64748b;margin-bottom:28px;line-height:1.5}
    label{display:block;font-size:12px;font-weight:500;color:#94a3b8;margin-bottom:6px}
    input{width:100%;padding:11px 14px;background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-size:14px;outline:none;margin-bottom:16px;transition:border-color .15s}
    input:focus{border-color:#6366f1}
    input::placeholder{color:#334155}
    .btn{width:100%;padding:12px;background:#4f46e5;border:none;border-radius:10px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s}
    .btn:hover{background:#4338ca}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .err{padding:12px 14px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;color:#f87171;font-size:13px;margin-bottom:16px;display:none}
    .ok{text-align:center;display:none}
    .ok-icon{font-size:48px;margin-bottom:16px}
    .ok h3{font-size:20px;font-weight:700;color:#fff;margin-bottom:8px}
    .ok p{font-size:14px;color:#64748b;margin-bottom:24px;line-height:1.6}
    .ok a{display:inline-block;padding:11px 28px;background:#4f46e5;border-radius:10px;color:#fff;font-size:14px;font-weight:600;text-decoration:none}
    .ok a:hover{background:#4338ca}
  </style>
</head>
<body>
  <div class="logo">
    <div class="logo-icon"><span class="logo-letter">H</span></div>
    <div class="logo-name">Healix Engage</div>
  </div>
  <div class="card">
    <div class="err" id="err"></div>
    <div id="form-section">
      <h2>Set a new password</h2>
      <p class="sub">Choose a strong password with at least 8 characters.</p>
      <form id="form">
        <label>New Password</label>
        <input type="password" id="pw" placeholder="Min. 8 characters" minlength="8" required>
        <label>Confirm Password</label>
        <input type="password" id="pw2" placeholder="Repeat new password" minlength="8" required>
        <button class="btn" id="btn" type="submit">Set New Password</button>
      </form>
    </div>
    <div class="ok" id="ok">
      <div class="ok-icon">✅</div>
      <h3>Password updated!</h3>
      <p>Your password has been changed. You can now sign in with your new password.</p>
      <a href="${appUrl}">Go to Sign In &rarr;</a>
    </div>
  </div>
  <script>
    var token = new URLSearchParams(location.search).get('token');
    var err = document.getElementById('err');
    var btn = document.getElementById('btn');
    if (!token) {
      err.textContent = 'Invalid or missing reset token. Please request a new reset link.';
      err.style.display = 'block';
      document.getElementById('form').style.display = 'none';
    }
    document.getElementById('form').addEventListener('submit', async function(e) {
      e.preventDefault();
      var pw = document.getElementById('pw').value;
      var pw2 = document.getElementById('pw2').value;
      err.style.display = 'none';
      if (pw !== pw2) { err.textContent = 'Passwords do not match.'; err.style.display = 'block'; return; }
      btn.disabled = true; btn.textContent = 'Updating…';
      try {
        var r = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({token: token, password: pw})
        });
        var data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Something went wrong.');
        document.getElementById('form-section').style.display = 'none';
        document.getElementById('ok').style.display = 'block';
      } catch(e) {
        err.textContent = e.message; err.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Set New Password';
      }
    });
  </script>
</body>
</html>`;
  res.send(html);
});

// 404 fallthrough
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`PRM server running on http://localhost:${PORT}`);
  console.log(`ADO org: ${process.env.ADO_ORG} / project: ${process.env.ADO_PROJECT}`);
});
