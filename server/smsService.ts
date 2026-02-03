// Twilio SMS Service for Loan Digest Notifications
// Uses Replit's Twilio integration for secure credential management

import twilio from 'twilio';

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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

// Send an SMS message
export async function sendSms(
  toPhoneNumber: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    if (!fromNumber) {
      return { success: false, error: 'Twilio phone number not configured' };
    }

    // Normalize phone number format
    let normalizedTo = toPhoneNumber.replace(/\D/g, '');
    if (!normalizedTo.startsWith('1') && normalizedTo.length === 10) {
      normalizedTo = '1' + normalizedTo;
    }
    if (!normalizedTo.startsWith('+')) {
      normalizedTo = '+' + normalizedTo;
    }

    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: normalizedTo,
    });

    console.log(`SMS sent to ${normalizedTo}: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('Failed to send SMS:', error);
    return { success: false, error: error.message };
  }
}

// Send a digest SMS notification
export async function sendDigestSms(
  toPhoneNumber: string,
  projectName: string,
  outstandingDocsCount: number,
  updatesCount: number,
  portalLink: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  let message = `Sphinx Capital - ${projectName}\n\n`;
  
  if (outstandingDocsCount > 0) {
    message += `${outstandingDocsCount} document(s) still needed.\n`;
  }
  
  if (updatesCount > 0) {
    message += `${updatesCount} new update(s) on your loan.\n`;
  }
  
  message += `\nView details: ${portalLink}`;
  
  // SMS has 160 character limit for single message, 1600 for multi-part
  // Keep it concise but informative
  if (message.length > 160) {
    message = `Sphinx: ${projectName} - ${outstandingDocsCount} docs needed. View: ${portalLink}`;
  }
  
  return sendSms(toPhoneNumber, message);
}

// Send a custom SMS with any message content
export async function sendCustomSms(
  toPhoneNumber: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Truncate if message is too long (keep under 160 for single segment)
  const truncatedMessage = message.length > 160 
    ? message.substring(0, 157) + '...'
    : message;
  
  return sendSms(toPhoneNumber, truncatedMessage);
}
