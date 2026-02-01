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
    const { client } = await getResendClient();
    
    // Use Resend's test domain - for production, verify your domain at https://resend.com/domains
    const result = await client.emails.send({
      from: 'Sphinx Capital <onboarding@resend.dev>',
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
              <p>Powered by Sphinx Capital</p>
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

export async function sendCompletedDocument(
  recipientEmail: string,
  recipientName: string,
  documentName: string,
  allSigners: string[],
  downloadLink: string
) {
  try {
    const { client } = await getResendClient();
    
    // Use Resend's test domain - for production, verify your domain at https://resend.com/domains
    const result = await client.emails.send({
      from: 'Sphinx Capital <onboarding@resend.dev>',
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
              <p>Powered by Sphinx Capital</p>
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
