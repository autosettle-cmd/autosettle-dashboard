import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationCode(to: string, code: string, name: string) {
  await transporter.sendMail({
    from: `"Autosettle" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your Autosettle verification code',
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #191C1E; margin-bottom: 8px;">Verify your email</h2>
        <p style="color: #6B7280; font-size: 14px;">Hi ${name}, use this code to verify your Autosettle account:</p>
        <div style="background: #F3F4F6; padding: 16px 24px; text-align: center; margin: 24px 0; border-radius: 4px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #234B6E;">${code}</span>
        </div>
        <p style="color: #9CA3AF; font-size: 12px;">This code expires in 15 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}
