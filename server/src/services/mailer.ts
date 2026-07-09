import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ADMIN_EMAIL = 'ganesh.bandi@globalhealthx.co';
const ADMIN_NAME  = 'Ganesh Bandi';

function sendViaOutlook(toEmail: string, toName: string, subject: string, html: string): void {
  const htmlPath = path.join(os.tmpdir(), `prm-email-${Date.now()}.html`);
  fs.writeFileSync(htmlPath, html, 'utf-8');

  const safeSubject = subject.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safeName    = toName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safeTo      = toEmail.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const script = `set htmlContent to (do shell script "cat " & quoted form of "${htmlPath}")
tell application "Microsoft Outlook" to activate
delay 1
with timeout of 60 seconds
  tell application "Microsoft Outlook"
    set newMsg to make new outgoing message with properties {subject:"${safeSubject}"}
    set content of newMsg to htmlContent
    make new to recipient at end of to recipients of newMsg with properties {email address:{name:"${safeName}", address:"${safeTo}"}}
    send newMsg
  end tell
end timeout
return "sent"`;

  const scriptPath = path.join(os.tmpdir(), `prm-send-${Date.now()}.applescript`);
  fs.writeFileSync(scriptPath, script, 'utf-8');
  execSync(`osascript "${scriptPath}"`, { timeout: 90000 });
}

export function sendNewUserNotification(newUserName: string, newUserEmail: string): void {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:40px 20px;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:40px;border:1px solid #e2e8f0;box-shadow:0 4px 20px rgba(0,0,0,.08)">
    <div style="text-align:center;margin-bottom:28px">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:14px;background:#ede9fe;margin-bottom:12px">
        <span style="font-size:26px;font-weight:900;color:#4f46e5">H</span>
      </div>
      <div style="font-size:20px;font-weight:800;color:#1e293b">Healix Engage</div>
    </div>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:24px;display:flex;align-items:center;gap:10px">
      <span style="font-size:22px">👤</span>
      <div>
        <div style="font-size:13px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.05em">New User Registered</div>
        <div style="font-size:12px;color:#166534;margin-top:2px">${now}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px 8px 0 0;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;width:90px">Name</td>
        <td style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-top:1px solid #e2e8f0;border-radius:0 8px 0 0;font-size:14px;font-weight:700;color:#1e293b">${newUserName.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;background:#ffffff;border:1px solid #e2e8f0;border-top:none;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Email</td>
        <td style="padding:10px 14px;background:#ffffff;border:1px solid #e2e8f0;border-top:none;font-size:14px;color:#4f46e5">${newUserEmail.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Role</td>
        <td style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 0;font-size:14px;color:#1e293b">User <span style="font-size:11px;color:#94a3b8">(default)</span></td>
      </tr>
    </table>

    <div style="text-align:center;margin-bottom:20px">
      <a href="https://prm.gihonline.in" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:9px;text-decoration:none">
        Open Healix Engage →
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 14px">
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin:0">
      You are receiving this because you are the Healix Engage admin.<br>
      To promote this user to admin, go to Settings → User Management.
    </p>
  </div>
</body></html>`;

  sendViaOutlook(ADMIN_EMAIL, ADMIN_NAME, `New user registered: ${newUserName} (${newUserEmail})`, html);
}

export function sendPasswordResetEmail(toEmail: string, toName: string, resetLink: string): void {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:40px 20px;margin:0">
  <div style="max-width:460px;margin:0 auto;background:#ffffff;border-radius:14px;padding:40px;border:1px solid #e2e8f0;box-shadow:0 4px 20px rgba(0,0,0,.08)">
    <div style="text-align:center;margin-bottom:28px">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:14px;background:#ede9fe;margin-bottom:12px">
        <span style="font-size:26px;font-weight:900;color:#4f46e5">H</span>
      </div>
      <div style="font-size:20px;font-weight:800;color:#1e293b">Healix Engage</div>
    </div>
    <h2 style="font-size:18px;font-weight:700;color:#1e293b;margin:0 0 8px">Reset your password</h2>
    <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px">Hi ${toName.replace(/'/g, "&#39;")},<br><br>We received a request to reset the password for your account. Click the button below to choose a new password. This link expires in <strong>30 minutes</strong>.</p>
    <div style="text-align:center;margin-bottom:28px">
      <a href="${resetLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:-.2px" target="_blank">Reset Password</a>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0 0 12px">Or copy this link into your browser:</p>
    <p style="font-size:11px;color:#6366f1;text-align:center;word-break:break-all;background:#f5f3ff;border-radius:6px;padding:8px 12px;margin:0 0 24px">${resetLink}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px">
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0">If you didn't request a password reset, you can safely ignore this email.<br>Your password will not change.</p>
  </div>
</body></html>`;

  sendViaOutlook(toEmail, toName, 'Reset your Healix Engage password', html);
}
