// Resend email service for document signing
import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export async function sendSigningInvitation(
  signerEmail: string,
  signerName: string,
  documentName: string,
  senderName: string,
  signingLink: string
) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const result = await client.emails.send({
      from: fromEmail || 'Lendry.AI <info@lendry.ai>',
      to: signerEmail,
      subject: `Document Ready for Signature: ${documentName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Document Signature Request</h1>
            </div>
            <div class="content">
              <p>Hello ${signerName},</p>
              <p><strong>${senderName}</strong> has requested your signature on the following document:</p>
              <p style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #1e40af;">
                <strong>${documentName}</strong>
              </p>
              <p>Please review and sign the document by clicking the button below:</p>
              <div style="text-align: center;">
                <a href="${signingLink}" class="button">Review & Sign Document</a>
              </div>
              <p style="color: #64748b; font-size: 14px;">This link is unique to you and will expire in 7 days.</p>
            </div>
            <div class="footer">
              <p>Powered by Lendry.AI</p>
            </div>
          </div>
        </body>
        </html>
      `
    });
    
    return { success: true, result };
  } catch (error: any) {
    console.error('Failed to send signing invitation:', error);
    return { success: false, error: error.message };
  }
}

export async function sendTeamInviteEmail(
  recipientEmail: string,
  recipientName: string,
  inviterName: string,
  companyName: string,
  role: string,
  inviteLink: string
) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const roleLabel = role === 'admin' ? 'Admin' : 'Processor';
    
    const result = await client.emails.send({
      from: fromEmail || `${companyName} <info@lendry.ai>`,
      to: recipientEmail,
      subject: `You've been invited to join ${companyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
            .info-box { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #1e40af; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Team Invitation</h1>
            </div>
            <div class="content">
              <p>Hello ${recipientName},</p>
              <p><strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> as a <strong>${roleLabel}</strong>.</p>
              <div class="info-box">
                <p style="margin: 0;"><strong>Role:</strong> ${roleLabel}</p>
                <p style="margin: 5px 0 0 0;"><strong>Email:</strong> ${recipientEmail}</p>
              </div>
              <p>Click the button below to set up your password and get started:</p>
              <div style="text-align: center;">
                <a href="${inviteLink}" class="button">Accept Invitation</a>
              </div>
              <p style="color: #64748b; font-size: 14px;">This invitation link will expire in 7 days.</p>
            </div>
            <div class="footer">
              <p>Powered by ${companyName}</p>
            </div>
          </div>
        </body>
        </html>
      `
    });
    
    return { success: true, result };
  } catch (error: any) {
    console.error('Failed to send team invite email:', error);
    return { success: false, error: error.message };
  }
}

export async function sendVoidNotification(
  signerEmail: string,
  signerName: string,
  documentName: string,
  senderName: string,
  reason?: string
) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const result = await client.emails.send({
      from: fromEmail || 'Lendry.AI <info@lendry.ai>',
      to: signerEmail,
      subject: `Document Cancelled: ${documentName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Document Cancelled</h1>
            </div>
            <div class="content">
              <p>Hello ${signerName},</p>
              <p>The document <strong>"${documentName}"</strong> that was sent to you for signature has been cancelled by ${senderName}.</p>
              ${reason ? `<p>Reason: ${reason}</p>` : ''}
              <p>No further action is required on your part.</p>
              <p>If you have any questions, please contact ${senderName} directly.</p>
            </div>
            <div class="footer">
              <p>Powered by Lendry.AI</p>
            </div>
          </div>
        </body>
        </html>
      `
    });
    
    return { success: true, result };
  } catch (error: any) {
    console.error('Failed to send void notification:', error);
    return { success: false, error: error.message };
  }
}

export async function sendSigningReminder(
  signerEmail: string,
  signerName: string,
  documentName: string,
  senderName: string,
  signingLink: string
) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const result = await client.emails.send({
      from: fromEmail || 'Lendry.AI <info@lendry.ai>',
      to: signerEmail,
      subject: `Reminder: Document Waiting for Your Signature - ${documentName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Signature Reminder</h1>
            </div>
            <div class="content">
              <p>Hello ${signerName},</p>
              <p>This is a friendly reminder that <strong>${senderName}</strong> is waiting for your signature on:</p>
              <p style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b;">
                <strong>${documentName}</strong>
              </p>
              <p>Please take a moment to review and sign the document:</p>
              <div style="text-align: center;">
                <a href="${signingLink}" class="button">Review & Sign Document</a>
              </div>
              <p style="color: #64748b; font-size: 14px;">This link is unique to you. Please do not share it with others.</p>
            </div>
            <div class="footer">
              <p>Powered by Lendry.AI</p>
            </div>
          </div>
        </body>
        </html>
      `
    });
    
    return { success: true, result };
  } catch (error: any) {
    console.error('Failed to send signing reminder:', error);
    return { success: false, error: error.message };
  }
}

export async function sendCompletedDocument(
  recipientEmail: string,
  recipientName: string,
  documentName: string,
  allSigners: string[],
  downloadLink: string
) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const result = await client.emails.send({
      from: fromEmail || 'Lendry.AI <info@lendry.ai>',
      to: recipientEmail,
      subject: `Document Completed: ${documentName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Document Completed</h1>
            </div>
            <div class="content">
              <p>Hello ${recipientName},</p>
              <p>Great news! The following document has been signed by all parties:</p>
              <p style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #16a34a;">
                <strong>${documentName}</strong>
              </p>
              <p><strong>Signers:</strong></p>
              <ul>
                ${allSigners.map(s => `<li>${s}</li>`).join('')}
              </ul>
              <div style="text-align: center;">
                <a href="${downloadLink}" class="button">Download Signed Document</a>
              </div>
            </div>
            <div class="footer">
              <p>Powered by Lendry.AI</p>
            </div>
          </div>
        </body>
        </html>
      `
    });
    
    return { success: true, result };
  } catch (error: any) {
    console.error('Failed to send completed document email:', error);
    return { success: false, error: error.message };
  }
}

export async function sendPasswordResetEmail(
  recipientEmail: string,
  recipientName: string,
  resetLink: string
) {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const result = await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: 'Password Reset Request - Lendry.AI',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { 
              display: inline-block; 
              background: #1e40af; 
              color: white !important; 
              padding: 14px 28px; 
              text-decoration: none; 
              border-radius: 6px;
              font-weight: bold;
              margin: 20px 0;
            }
            .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset</h1>
            </div>
            <div class="content">
              <p>Hello ${recipientName},</p>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <div style="text-align: center;">
                <a href="${resetLink}" class="button">Reset Password</a>
              </div>
              <p>This link will expire in 1 hour for security reasons.</p>
              <p>If you didn't request a password reset, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>Powered by Lendry.AI</p>
            </div>
          </div>
        </body>
        </html>
      `
    });
    
    return { success: true, result };
  } catch (error: any) {
    console.error('Failed to send password reset email:', error);
    return { success: false, error: error.message };
  }
}
