// Broker AI SDR Service
// Handles AI-powered contact outreach, message generation, and automation suggestions

import { db } from '../db';
import { brokerContacts, brokerOutreachMessages, brokerChannelConfigs, insertBrokerOutreachMessageSchema } from '@shared/schema';
import { eq, and, desc, gt, lt, inArray } from 'drizzle-orm';
import { getResendClient } from '../email';
import { decryptToken } from '../utils/encryption';
import OpenAI from 'openai';
import { differenceInDays } from 'date-fns';

interface TwilioConfig {
  accountSid: string;
  apiKey: string;
  apiKeySecret: string;
  fromNumber: string;
}

const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: aiApiKey || 'disabled',
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});


interface GenerateOutreachRequest {
  brokerId: number;
  contactIds: number[];
  prompt: string;
  channel: 'email' | 'sms' | 'both';
}

interface GeneratedMessage {
  contactId: number;
  contactName: string;
  email?: string;
  phone?: string;
  channel: 'email' | 'sms';
  subject?: string;
  body: string;
  personalizedBody: string;
  aiGenerated: boolean;
}

interface AutomationSuggestion {
  id: string;
  title: string;
  description: string;
  contactCount: number;
  actionLabel: string;
  actionType: 'reengagement' | 'birthday' | 'followup' | 'custom';
  metadata: Record<string, any>;
}

/**
 * Generate personalized AI outreach messages for a list of contacts
 */
export async function generateOutreachMessages(
  request: GenerateOutreachRequest
): Promise<GeneratedMessage[]> {
  const { brokerId, contactIds, prompt, channel } = request;

  // Fetch contacts
  const contacts = await db.query.brokerContacts.findMany({
    where: (contacts) =>
      and(
        eq(contacts.brokerId, brokerId),
        contactIds.length > 0 ? inArray(contacts.id, contactIds) : undefined
      ),
  });

  if (contacts.length === 0) {
    return [];
  }

  const messages: GeneratedMessage[] = [];

  // Generate messages for each contact using AI
  for (const contact of contacts) {
    const contactInfo = `
Name: ${contact.firstName} ${contact.lastName}
Email: ${contact.email || 'N/A'}
Phone: ${contact.phone || 'N/A'}
Company: ${contact.company || 'N/A'}
Contact Type: ${contact.contactType}
Tags: ${contact.tags ? (Array.isArray(contact.tags) ? contact.tags.join(', ') : 'N/A') : 'N/A'}
Last Contacted: ${contact.lastContactedAt ? new Date(contact.lastContactedAt).toLocaleDateString() : 'Never'}
Notes: ${contact.notes || 'N/A'}
`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `You are an expert sales development representative. Generate a personalized ${channel === 'email' ? 'email' : 'SMS'} message based on the following broker request and contact information.

Broker Request: ${prompt}

Contact Information:
${contactInfo}

For EMAIL (if applicable):
- Generate a subject line that's compelling and specific to this contact
- Write a concise, personalized message body (keep under 150 words)
- The tone should be professional but conversational
- Reference specific details from their profile to show personalization
- Include a clear call-to-action

For SMS (if applicable):
- Keep under 160 characters
- Be direct and concise
- Still reference something personal about them if possible
- Include a clear CTA

${channel === 'email'
  ? 'Format your response as JSON: { "subject": "...", "body": "..." }'
  : 'Format your response as JSON: { "body": "..." }'}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      let parsedMessage;
      try {
        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }
        parsedMessage = JSON.parse(jsonMatch[0]);
      } catch (error) {
        console.error('Error parsing AI response:', error, content);
        // Fallback to basic message
        parsedMessage = {
          subject: 'Hello ' + contact.firstName,
          body: `Hi ${contact.firstName}, ${prompt}`,
        };
      }

      if (channel === 'email' || channel === 'both') {
        messages.push({
          contactId: contact.id,
          contactName: `${contact.firstName} ${contact.lastName}`,
          email: contact.email,
          channel: 'email',
          subject: parsedMessage.subject || 'Hello ' + contact.firstName,
          body: parsedMessage.body || prompt,
          personalizedBody: parsedMessage.body || prompt,
          aiGenerated: true,
        });
      }

      if (channel === 'sms' || channel === 'both') {
        messages.push({
          contactId: contact.id,
          contactName: `${contact.firstName} ${contact.lastName}`,
          phone: contact.phone,
          channel: 'sms',
          body: parsedMessage.body || prompt,
          personalizedBody: parsedMessage.body || prompt,
          aiGenerated: true,
        });
      }
    } catch (error) {
      console.error(
        `Error generating message for contact ${contact.id}:`,
        error
      );
      // Still add a fallback message
      const fallbackBody = `Hi ${contact.firstName}, ${prompt}`;
      if (channel === 'email' || channel === 'both') {
        messages.push({
          contactId: contact.id,
          contactName: `${contact.firstName} ${contact.lastName}`,
          email: contact.email,
          channel: 'email',
          subject: 'Hello ' + contact.firstName,
          body: fallbackBody,
          personalizedBody: fallbackBody,
          aiGenerated: false,
        });
      }

      if (channel === 'sms' || channel === 'both') {
        messages.push({
          contactId: contact.id,
          contactName: `${contact.firstName} ${contact.lastName}`,
          phone: contact.phone,
          channel: 'sms',
          body: fallbackBody,
          personalizedBody: fallbackBody,
          aiGenerated: false,
        });
      }
    }
  }

  return messages;
}

/**
 * Suggest automation opportunities based on broker's contacts
 */
export async function suggestAutomations(
  brokerId: number
): Promise<AutomationSuggestion[]> {
  const suggestions: AutomationSuggestion[] = [];
  const today = new Date();

  try {
    // Get all contacts
    const allContacts = await db.query.brokerContacts.findMany({
      where: eq(brokerContacts.brokerId, brokerId),
    });

    if (allContacts.length === 0) {
      return [];
    }

    // Suggestion 1: Re-engagement for inactive contacts (60+ days)
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const inactiveContacts = allContacts.filter((c) => {
      if (!c.lastContactedAt) return true;
      return new Date(c.lastContactedAt) < sixtyDaysAgo;
    });

    if (inactiveContacts.length > 0) {
      suggestions.push({
        id: 'reengagement-60days',
        title: `Re-engage ${inactiveContacts.length} inactive contacts`,
        description: `You haven't reached out to ${inactiveContacts.length} contact(s) in 60+ days. Send a friendly check-in message.`,
        contactCount: inactiveContacts.length,
        actionLabel: 'Draft Re-engagement Messages',
        actionType: 'reengagement',
        metadata: {
          contactIds: inactiveContacts.map((c) => c.id),
          daysInactive: 60,
        },
      });
    }

    // Suggestion 2: 30-day check-in
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const inactive30Days = allContacts.filter((c) => {
      if (!c.lastContactedAt) return false;
      const daysAgo = differenceInDays(today, new Date(c.lastContactedAt));
      return daysAgo >= 25 && daysAgo < 60;
    });

    if (inactive30Days.length > 0) {
      suggestions.push({
        id: 'checkin-30days',
        title: `Check in with ${inactive30Days.length} contacts`,
        description: `${inactive30Days.length} contact(s) haven't heard from you in 30+ days. Send a quick update.`,
        contactCount: inactive30Days.length,
        actionLabel: 'Draft Check-in Messages',
        actionType: 'followup',
        metadata: {
          contactIds: inactive30Days.map((c) => c.id),
          daysInactive: 30,
        },
      });
    }

    // Suggestion 3: New leads follow-up (created in last 7 days, never contacted)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newLeads = allContacts.filter((c) => {
      return (
        new Date(c.createdAt) > sevenDaysAgo &&
        !c.lastContactedAt &&
        c.contactType === 'prospect'
      );
    });

    if (newLeads.length > 0) {
      suggestions.push({
        id: 'followup-newleads',
        title: `Follow up with ${newLeads.length} new leads`,
        description: `You have ${newLeads.length} new prospect(s) added recently that haven't been contacted yet.`,
        contactCount: newLeads.length,
        actionLabel: 'Draft Welcome Messages',
        actionType: 'followup',
        metadata: {
          contactIds: newLeads.map((c) => c.id),
          type: 'new_leads',
        },
      });
    }

    // Suggestion 4: Birthday contacts (if birthday field existed, simplified here)
    // This is a placeholder - would need birthday field in schema
    const birthdayContacts = allContacts.filter((c) => {
      // This would check if birthday is this month
      // For now, just show a generic suggestion if they have many contacts
      return false;
    });

    return suggestions;
  } catch (error) {
    console.error('Error generating automation suggestions:', error);
    return [];
  }
}

/**
 * Send a single approved outreach message
 */
export async function sendOutreachMessage(
  messageId: number,
  brokerId: number
): Promise<{ success: boolean; error?: string; sentAt?: Date; status?: string }> {
  try {
    // Fetch the message
    const message = await db.query.brokerOutreachMessages.findFirst({
      where: (msg) =>
        and(eq(msg.id, messageId), eq(msg.brokerId, brokerId)),
    });

    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    if (message.status !== 'draft' && message.status !== 'approved') {
      return {
        success: false,
        error: `Cannot send message with status: ${message.status}`,
      };
    }

    // For SMS: check opt-out status before sending
    if (message.channel === 'sms' && message.contactId) {
      const contact = await db.query.brokerContacts.findFirst({
        where: (c) => eq(c.id, message.contactId!),
      });
      if (contact?.smsOptedOut) {
        await db
          .update(brokerOutreachMessages)
          .set({ status: 'opted_out' } as any)
          .where(eq(brokerOutreachMessages.id, messageId));
        return { success: false, error: 'Contact has opted out of SMS', status: 'opted_out' };
      }
    }

    let sendResult: { success: boolean; error?: string; twilioSid?: string };

    if (message.channel === 'email') {
      sendResult = await sendEmailMessage(message);
    } else if (message.channel === 'sms') {
      sendResult = await sendSmsMessageViaBrokerTwilio(message, brokerId);
    } else {
      return { success: false, error: 'Unknown channel: ' + message.channel };
    }

    if (!sendResult.success) {
      await db
        .update(brokerOutreachMessages)
        .set({ status: 'failed', deliveryStatus: 'failed' } as any)
        .where(eq(brokerOutreachMessages.id, messageId));

      return sendResult;
    }

    // Update message status to sent with Twilio SID if available
    const sentAt = new Date();
    await db
      .update(brokerOutreachMessages)
      .set({
        status: 'sent',
        sentAt,
        ...(sendResult.twilioSid ? { twilioMessageSid: sendResult.twilioSid, deliveryStatus: 'sent' } : {}),
      } as any)
      .where(eq(brokerOutreachMessages.id, messageId));

    // Update contact's lastContactedAt
    if (message.contactId) {
      await db
        .update(brokerContacts)
        .set({ lastContactedAt: sentAt } as any)
        .where(eq(brokerContacts.id, message.contactId));
    }

    return { success: true, sentAt };
  } catch (error) {
    console.error('Error sending outreach message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send multiple approved messages
 */
export async function sendBatchMessages(
  messageIds: number[],
  brokerId: number
): Promise<
  Array<{ messageId: number; success: boolean; error?: string; sentAt?: Date }>
> {
  const results: Array<{
    messageId: number;
    success: boolean;
    error?: string;
    sentAt?: Date;
  }> = [];

  for (const messageId of messageIds) {
    const result = await sendOutreachMessage(messageId, brokerId);
    results.push({
      messageId,
      ...result,
    });
  }

  return results;
}

/**
 * Helper: Send email message via Resend
 */
async function sendEmailMessage(
  message: any
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!message.email || !message.subject) {
      return {
        success: false,
        error: 'Missing email address or subject',
      };
    }

    const { client } = await getResendClient();

    const result = await client.emails.send({
      from: 'noreply@lendry.ai',
      to: message.email,
      subject: message.subject,
      html: `<p>${(message.personalizedBody || message.body).replace(/\n/g, '<br>')}</p>`,
    });

    if (!result.id) {
      return { success: false, error: 'Failed to send email' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Helper: Send SMS via broker's own Twilio number from broker_channel_configs
 */
async function sendSmsMessageViaBrokerTwilio(
  message: any,
  brokerId: number
): Promise<{ success: boolean; error?: string; twilioSid?: string }> {
  try {
    if (!message.phone) {
      return { success: false, error: 'Missing phone number for contact' };
    }

    // Fetch broker's SMS channel config
    const [smsRow] = await db
      .select()
      .from(brokerChannelConfigs)
      .where(
        and(
          eq(brokerChannelConfigs.brokerId, brokerId),
          eq(brokerChannelConfigs.type, 'sms'),
          eq(brokerChannelConfigs.isActive, true)
        )
      );

    if (!smsRow) {
      return {
        success: false,
        error: 'No SMS channel configured. Connect your Twilio account in Settings → Integrations.',
      };
    }

    if (!smsRow.smsApproved) {
      return {
        success: false,
        error: 'Your SMS channel is pending approval. Contact support to enable outbound SMS.',
      };
    }

    const cfg = smsRow.config as TwilioConfig;

    if (!cfg.apiKey || !cfg.apiKeySecret || !cfg.accountSid || !cfg.fromNumber) {
      return { success: false, error: 'Incomplete Twilio configuration' };
    }

    // Normalize destination number
    let toNumber = message.phone.replace(/\D/g, '');
    if (!toNumber.startsWith('1') && toNumber.length === 10) {
      toNumber = '1' + toNumber;
    }
    if (!toNumber.startsWith('+')) {
      toNumber = '+' + toNumber;
    }

    const twilio = (await import('twilio')).default;
    const client = twilio(decryptToken(cfg.apiKey), decryptToken(cfg.apiKeySecret), {
      accountSid: cfg.accountSid,
    });

    const result = await client.messages.create({
      body: message.personalizedBody || message.body,
      from: cfg.fromNumber,
      to: toNumber,
    });

    console.log(`[BrokerSMS] Sent from ${cfg.fromNumber} to ${toNumber}, SID: ${result.sid}`);
    return { success: true, twilioSid: result.sid };
  } catch (error) {
    console.error('Error sending broker SMS:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Save draft message to database
 */
export async function saveDraftMessages(
  brokerId: number,
  messages: GeneratedMessage[]
): Promise<any[]> {
  const savedMessages = [];

  for (const msg of messages) {
    const [dbMessage] = await db.insert(brokerOutreachMessages).values({
      brokerId,
      contactId: msg.contactId,
      channel: msg.channel,
      subject: msg.subject,
      body: msg.body,
      personalizedBody: msg.personalizedBody,
      status: 'draft',
      aiGenerated: msg.aiGenerated,
    } as any).returning();

    savedMessages.push(dbMessage);
  }

  return savedMessages;
}
