import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
      <a href="${resetLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:-.2px">Reset Password</a>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0 0 12px">Or copy this link into your browser:</p>
    <p style="font-size:11px;color:#6366f1;text-align:center;word-break:break-all;background:#f5f3ff;border-radius:6px;padding:8px 12px;margin:0 0 24px">${resetLink}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px">
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0">If you didn't request a password reset, you can safely ignore this email.<br>Your password will not change.</p>
  </div>
</body></html>`;

  const htmlPath = path.join(os.tmpdir(), 'prm-reset-email.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');

  const subject = 'Reset your Healix Engage password';
  // Escape for embedding in AppleScript strings
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

  const scriptPath = path.join(os.tmpdir(), 'prm-reset-send.applescript');
  fs.writeFileSync(scriptPath, script, 'utf-8');
  execSync(`osascript "${scriptPath}"`, { timeout: 90000 });
}
