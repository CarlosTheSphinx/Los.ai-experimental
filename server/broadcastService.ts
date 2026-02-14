// Partner Broadcast Service
// Sends mass personalized emails and SMS to all partners
// Uses Replit's Resend and Twilio integrations

import { db } from './db';
import { partners, partnerBroadcasts, partnerBroadcastRecipients, inboundSmsMessages } from '@shared/schema';
import { eq, isNull, and, isNotNull } from 'drizzle-orm';
import { getResendClient } from './email';
import { sendSms as sendSmsMessage, getTwilioFromPhoneNumber } from './smsService';

interface PersonalizedMessage {
  partnerId: number;
  name: string;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  emailBody: string;
  smsBody: string;
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

function personalizeMessage(template: string, data: {
  firstName: string;
  lastName: string;
  name: string;
  companyName: string;
}): string {
  return template
    .replace(/\{\{firstName\}\}/gi, data.firstName)
    .replace(/\{\{lastName\}\}/gi, data.lastName)
    .replace(/\{\{name\}\}/gi, data.name)
    .replace(/\{\{companyName\}\}/gi, data.companyName || '');
}

export async function sendPartnerBroadcast(
  broadcastId: number,
  subject: string,
  emailBody: string,
  smsBody: string | null,
  sendEmail: boolean,
  sendSms: boolean,
  sentBy: number
): Promise<{ success: boolean; stats: { emailsSent: number; smsSent: number; emailsFailed: number; smsFailed: number } }> {
  const stats = {
    emailsSent: 0,
    smsSent: 0,
    emailsFailed: 0,
    smsFailed: 0
  };

  try {
    // Get all active partners
    const allPartners = await db.select().from(partners).where(eq(partners.isActive, true));
    
    if (allPartners.length === 0) {
      return { success: false, stats };
    }

    // Update broadcast status to sending
    await db.update(partnerBroadcasts)
      .set({ status: 'sending', recipientCount: allPartners.length })
      .where(eq(partnerBroadcasts.id, broadcastId));

    // Prepare personalized messages
    const personalizedMessages: PersonalizedMessage[] = allPartners.map(partner => {
      const { firstName, lastName } = parseName(partner.name);
      const data = {
        firstName,
        lastName,
        name: partner.name,
        companyName: partner.companyName || ''
      };

      return {
        partnerId: partner.id,
        name: partner.name,
        firstName,
        lastName,
        companyName: partner.companyName || '',
        email: partner.email,
        phone: partner.phone,
        emailBody: personalizeMessage(emailBody, data),
        smsBody: smsBody ? personalizeMessage(smsBody, data) : ''
      };
    });

    // Create recipient records
    for (const msg of personalizedMessages) {
      await db.insert(partnerBroadcastRecipients).values({
        broadcastId,
        partnerId: msg.partnerId,
        partnerName: msg.name,
        email: msg.email,
        phone: msg.phone,
        personalizedEmailBody: msg.emailBody,
        personalizedSmsBody: msg.smsBody || null,
        emailStatus: sendEmail && msg.email ? 'pending' : 'skipped',
        smsStatus: sendSms && msg.phone ? 'pending' : 'skipped'
      });
    }

    // Send emails
    if (sendEmail) {
      const { client: resend } = await getResendClient();
      
      for (const msg of personalizedMessages) {
        if (!msg.email) continue;

        try {
          await resend.emails.send({
            from: 'Lendry.AI <onboarding@resend.dev>',
            to: msg.email,
            subject: personalizeMessage(subject, {
              firstName: msg.firstName,
              lastName: msg.lastName,
              name: msg.name,
              companyName: msg.companyName
            }),
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                  .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
                  .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; padding: 20px; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>Lendry.AI</h1>
                  </div>
                  <div class="content">
                    ${msg.emailBody.replace(/\n/g, '<br/>')}
                  </div>
                  <div class="footer">
                    <p>Lendry.AI - Your Partner in Lending</p>
                    <p style="font-size: 11px; color: #94a3b8;">
                      Reply to this email to contact us directly.
                    </p>
                  </div>
                </div>
              </body>
              </html>
            `
          });

          await db.update(partnerBroadcastRecipients)
            .set({ emailStatus: 'sent' })
            .where(and(
              eq(partnerBroadcastRecipients.broadcastId, broadcastId),
              eq(partnerBroadcastRecipients.partnerId, msg.partnerId)
            ));

          stats.emailsSent++;
        } catch (error: any) {
          console.error(`Failed to send email to ${msg.email}:`, error);
          
          await db.update(partnerBroadcastRecipients)
            .set({ emailStatus: 'failed', emailError: error.message })
            .where(and(
              eq(partnerBroadcastRecipients.broadcastId, broadcastId),
              eq(partnerBroadcastRecipients.partnerId, msg.partnerId)
            ));

          stats.emailsFailed++;
        }
      }
    }

    // Send SMS
    if (sendSms && smsBody) {
      for (const msg of personalizedMessages) {
        if (!msg.phone) continue;

        try {
          const result = await sendSmsMessage(msg.phone, msg.smsBody);
          
          if (result.success) {
            await db.update(partnerBroadcastRecipients)
              .set({ smsStatus: 'sent' })
              .where(and(
                eq(partnerBroadcastRecipients.broadcastId, broadcastId),
                eq(partnerBroadcastRecipients.partnerId, msg.partnerId)
              ));

            stats.smsSent++;
          } else {
            throw new Error(result.error || 'SMS send failed');
          }
        } catch (error: any) {
          console.error(`Failed to send SMS to ${msg.phone}:`, error);
          
          await db.update(partnerBroadcastRecipients)
            .set({ smsStatus: 'failed', smsError: error.message })
            .where(and(
              eq(partnerBroadcastRecipients.broadcastId, broadcastId),
              eq(partnerBroadcastRecipients.partnerId, msg.partnerId)
            ));

          stats.smsFailed++;
        }
      }
    }

    // Update broadcast as completed
    await db.update(partnerBroadcasts)
      .set({ 
        status: 'completed',
        completedAt: new Date(),
        emailsSent: stats.emailsSent,
        smsSent: stats.smsSent,
        emailsFailed: stats.emailsFailed,
        smsFailed: stats.smsFailed
      })
      .where(eq(partnerBroadcasts.id, broadcastId));

    return { success: true, stats };
  } catch (error: any) {
    console.error('Broadcast failed:', error);
    
    await db.update(partnerBroadcasts)
      .set({ 
        status: 'failed',
        emailsSent: stats.emailsSent,
        smsSent: stats.smsSent,
        emailsFailed: stats.emailsFailed,
        smsFailed: stats.smsFailed
      })
      .where(eq(partnerBroadcasts.id, broadcastId));

    return { success: false, stats };
  }
}


// Handle incoming SMS webhook from Twilio
export async function handleIncomingSms(
  fromPhone: string,
  toPhone: string,
  body: string,
  messageSid: string
): Promise<void> {
  // Normalize the from phone number for matching
  let normalizedFrom = fromPhone.replace(/\D/g, '');
  
  // Try to find the partner by phone number
  const matchingPartners = await db.select().from(partners);
  let matchedPartner = null;
  
  for (const partner of matchingPartners) {
    if (!partner.phone) continue;
    const normalizedPartnerPhone = partner.phone.replace(/\D/g, '');
    if (normalizedFrom.endsWith(normalizedPartnerPhone) || normalizedPartnerPhone.endsWith(normalizedFrom)) {
      matchedPartner = partner;
      break;
    }
  }

  // Find the most recent broadcast sent to this partner
  let broadcastId = null;
  if (matchedPartner) {
    const recentRecipient = await db.select()
      .from(partnerBroadcastRecipients)
      .where(eq(partnerBroadcastRecipients.partnerId, matchedPartner.id))
      .orderBy(partnerBroadcastRecipients.createdAt)
      .limit(1);
    
    if (recentRecipient.length > 0) {
      broadcastId = recentRecipient[0].broadcastId;
    }
  }

  // Store the inbound message
  await db.insert(inboundSmsMessages).values({
    fromPhone,
    toPhone,
    body,
    twilioMessageSid: messageSid,
    partnerId: matchedPartner?.id || null,
    broadcastId,
    isRead: false
  });

  console.log(`Inbound SMS received from ${fromPhone}: ${body}`);
}

// Get all inbound messages for admin inbox
export async function getInboundMessages(options?: { 
  unreadOnly?: boolean; 
  partnerId?: number;
  limit?: number;
}) {
  let query = db.select().from(inboundSmsMessages);
  
  // Build conditions based on options
  const conditions = [];
  if (options?.unreadOnly) {
    conditions.push(eq(inboundSmsMessages.isRead, false));
  }
  if (options?.partnerId) {
    conditions.push(eq(inboundSmsMessages.partnerId, options.partnerId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  // Get messages with partner info
  const messages = await db.select({
    message: inboundSmsMessages,
    partner: partners
  })
    .from(inboundSmsMessages)
    .leftJoin(partners, eq(inboundSmsMessages.partnerId, partners.id))
    .orderBy(inboundSmsMessages.createdAt)
    .limit(options?.limit || 100);

  return messages;
}

// Mark message as read
export async function markMessageRead(messageId: number): Promise<void> {
  await db.update(inboundSmsMessages)
    .set({ isRead: true })
    .where(eq(inboundSmsMessages.id, messageId));
}

// Get broadcast history
export async function getBroadcastHistory(limit = 50) {
  return await db.select()
    .from(partnerBroadcasts)
    .orderBy(partnerBroadcasts.createdAt)
    .limit(limit);
}
