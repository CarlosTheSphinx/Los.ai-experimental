
import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { savedQuotes, users, dealDocuments, dealDocumentFiles, dealTasks, dealProperties, partners, loanPrograms, programDocumentTemplates, programTaskTemplates, pricingRulesets, ruleProposals, guidelineUploads, pricingQuoteLogs, pricingRulesSchema, messageThreads, messages, messageReads, onboardingDocuments, userOnboardingProgress, projects, digestTemplates, documentTemplates, templateFields, fieldBindingKeys, workflowStepDefinitions, programWorkflowSteps, dealProcessors, projectStages, programReviewRules, creditPolicies, documentReviewResults, insertSubmissionCriteriaSchema, insertSubmissionFieldSchema, insertSubmissionDocumentRequirementSchema, insertSubmissionReviewRuleSchema, projectActivity, projectTasks, platformSettings, dealMemoryEntries, dealNotes, insertDealMemoryEntrySchema, insertDealNoteSchema, notifications, dealStatuses, insertDealStatusSchema, insertMessageTemplateSchema, dealThirdParties } from "@shared/schema";
import { priceQuote, validateRuleset, SAMPLE_RTL_RULESET, SAMPLE_DSCR_RULESET, type PricingInputs, analyzeGuidelines, refineProposal } from "./pricing";
import { getDocumentTemplatesForLoanType } from "./document-templates";
import { eq, desc, asc, inArray, and, gt, gte, lte, sql, isNull, or } from "drizzle-orm";
import { format } from "date-fns";
import { api } from "@shared/routes";
import { ApifyClient } from 'apify-client';
import { OAuth2Client } from 'google-auth-library';
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { sendCompletedDocument, sendVoidNotification, sendPasswordResetEmail, sendTeamInviteEmail } from './email';
import { sendCommercialNotification, checkExpiredSubmissions } from './services/commercialNotifications';
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  generateRandomToken, 
  authenticateUser, 
  setAuthCookie, 
  clearAuthCookie,
  type AuthRequest 
} from './auth';
import {
  runDigestJob,
  sendTestDigest,
  logLoanUpdate,
  getOutstandingDocuments,
  getRecentUpdates
} from './digestService';
import { loanDigestConfigs, loanDigestRecipients, loanUpdates, digestHistory, digestState, partnerBroadcasts, partnerBroadcastRecipients, inboundSmsMessages, scheduledDigestDrafts, esignEnvelopes, esignEvents } from '@shared/schema';
import { sendPartnerBroadcast, handleIncomingSms, getInboundMessages, markMessageRead, getBroadcastHistory } from './broadcastService';
import { registerObjectStorageRoutes, ObjectStorageService } from './replit_integrations/object_storage';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { encryptToken } from './utils/encryption';
import { registerAuthRoutes } from './routes/auth';
import { registerMessagingRoutes } from './routes/messaging';
import { registerPortalRoutes } from './routes/portal';
import { registerAdminProgramsRoutes } from './routes/admin-programs';

import { registerProcessorRoutes } from './routes/processor';
import { registerBrokerSdrRoutes } from './routes/broker-sdr';
import { registerAiAssistantRoutes } from './routes/ai-assistant';
import { registerAgentRoutes } from './routes/agents';
import { registerEmailRoutes } from './routes/email';
import { registerGoogleConnectRoutes } from './routes/googleConnect';
import { registerMicrosoftConnectRoutes } from './routes/microsoftConnect';


/**
 * Auto-trigger pipeline when documents are uploaded to a deal.
 * Checks if auto-trigger is enabled in platform settings before starting.
 */
async function maybeAutoTriggerPipeline(projectId: number, triggeredBy: number | null) {
  try {
    const [settings] = await db.select().from(platformSettings).limit(1);
    if (!settings?.autoRunPipeline) return;
    const { startPipeline } = await import('./agents/orchestrator');
    startPipeline(projectId, triggeredBy, "auto_upload").catch(err => {
      console.error(`Auto-trigger pipeline failed for project ${projectId}:`, err.message);
    });
    console.log(`Pipeline auto-triggered for project ${projectId} (document upload)`);
  } catch (err: any) {
    console.error('Auto-trigger check error:', err.message);
  }
}

// Initialize Apify client
const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.warn('Warning: APIFY_TOKEN environment variable is not set. Pricing scraper will not work.');
}
const client = new ApifyClient({ token: APIFY_TOKEN || '' });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ==================== URL REWRITE: deals → projects ====================
  // The frontend uses "deals" terminology but the backend routes are registered as "projects"
  // This middleware transparently rewrites deal-based paths to project-based paths
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.url.startsWith('/api/deals/') || req.url === '/api/deals') {
      req.url = req.url.replace('/api/deals', '/api/projects');
    }
    if (req.url.includes('/create-deal')) {
      req.url = req.url.replace('/create-deal', '/create-project');
    }
    next();
  });

  // Also handle /api/admin/deals → already has its own routes, but some sub-paths
  // like /api/admin/deals/:id/project need to keep working as-is (they are already
  // registered as /api/admin/deals routes, not /api/admin/projects)

  // ==================== OBJECT STORAGE ROUTES ====================
  registerObjectStorageRoutes(app);
  const objectStorageService = new ObjectStorageService();

  // ==================== ROUTE MODULES ====================

  // Admin authentication middleware - requires admin, staff, or super_admin role
  const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const user = await storage.getUserById(req.user.id);
      if (!user || !['admin', 'staff', 'super_admin', 'processor'].includes(user.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      next();
    } catch (error) {
      console.error('Admin auth error:', error);
      res.status(500).json({ error: 'Authorization failed' });
    }
  };

  const requireSuperAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const user = await storage.getUserById(req.user.id);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Super admin access required' });
      }
      
      next();
    } catch (error) {
      console.error('Super admin auth error:', error);
      res.status(500).json({ error: 'Authorization failed' });
    }
  };

  const requirePermission = (permissionKey: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        
        const user = await storage.getUserById(req.user.id);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        const userRoles = user.roles?.length ? user.roles : [user.role];

        if (userRoles.includes('super_admin')) {
          return next();
        }

        const hasTeamRole = userRoles.some(r => ['admin', 'staff', 'processor'].includes(r));
        if (!hasTeamRole) {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const allowed = await storage.hasPermissionMultiRole(userRoles, permissionKey);
        if (!allowed) {
          return res.status(403).json({ error: `Permission denied: ${permissionKey}` });
        }
        
        next();
      } catch (error) {
        console.error('Permission check error:', error);
        res.status(500).json({ error: 'Authorization failed' });
      }
    };
  };

  // Onboarding enforcement middleware - blocks brokers who haven't completed onboarding
  // Admins and borrowers are exempt
  const requireOnboarding = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const user = await storage.getUserById(req.user.id);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      // Team members are exempt from onboarding requirement
      if (['admin', 'staff', 'super_admin', 'processor'].includes(user.role)) {
        return next();
      }
      
      // Borrowers don't need onboarding (they have onboardingCompleted=true by default)
      if (user.userType === 'borrower') {
        return next();
      }
      
      // Brokers must complete onboarding
      if (user.userType === 'broker' && !user.onboardingCompleted) {
        return res.status(403).json({ 
          error: 'Onboarding required',
          code: 'ONBOARDING_REQUIRED',
          message: 'Please complete your onboarding before accessing this feature'
        });
      }
      
      next();
    } catch (error) {
      console.error('Onboarding check error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };

  // Register auth routes (address autocomplete, registration, login, OAuth, password reset)
  registerAuthRoutes(app, { storage, db, authenticateUser, requireAdmin, requireOnboarding, requirePermission, objectStorageService });

  // Register unified Google connect routes (Gmail + Drive in one OAuth flow)
  registerGoogleConnectRoutes(app, { storage, db, authenticateUser, requireAdmin, requireOnboarding, requirePermission, objectStorageService });

  // Register unified Microsoft connect routes (Outlook + OneDrive in one OAuth flow)
  registerMicrosoftConnectRoutes(app, { storage, db, authenticateUser, requireAdmin, requireOnboarding, requirePermission, objectStorageService });

  // Forgot password
  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      const user = await storage.getUserByEmail(email?.toLowerCase());
      
      if (!user) {
        return res.json({ success: true, message: 'If email exists, reset link sent' });
      }
      
      const resetToken = generateRandomToken();
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour
      
      await storage.updateUser(user.id, {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires
      });
      
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
      
      await sendPasswordResetEmail(user.email, user.fullName || 'User', resetUrl);
      
      res.json({ success: true, message: 'Password reset email sent' });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  });

  // Reset password
  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ error: 'Token and password are required' });
      }
      
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      const user = await storage.getUserByResetToken(token);
      
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      
      const passwordHash = await hashPassword(password);
      
      await storage.updateUser(user.id, {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null
      });
      
      res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // ==================== PUBLIC SIGNING ROUTES (Token-based, no user auth) ====================

  app.post(api.pricing.submit.path, async (req, res) => {
    try {
      console.log('\n🚀 Starting Apify scrape request...');
      
      const loanData = api.pricing.submit.input.parse(req.body);
      
      console.log('Loan data:', JSON.stringify(loanData, null, 2));

      // Log the request start
      await storage.logPricingRequest({
        requestData: loanData,
        status: 'pending'
      });
      
      // Run the Apify Puppeteer Scraper actor
      // We construct the pageFunction exactly as in the reference code
      const run = await client.actor('apify/puppeteer-scraper').call({
        startUrls: [{
          url: 'https://www.b-diya.nqxpricer.com/698e56b8d1a8ab83b327b498'
        }],
        pageFunction: `async function pageFunction(context) {
          const { page, request, log } = context;
          
          // Loan data passed from the server
          const loanData = ${JSON.stringify(loanData)};
          
          // Helper function for delays
          const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
          
          try {
            log.info('Page loaded, waiting for React to render form...');
            // Smart wait: Wait for form elements to be ready instead of fixed 12s delay
            await page.waitForSelector('input[placeholder="LTV"]', { timeout: 15000 });
            log.info('✅ Form loaded and ready!');
            
            // STEP 1: Fill text inputs using page.type() for proper React event handling
            log.info('Step 1: Filling text inputs...');
            
            const textInputs = [
              { id: ':r0:', value: loanData.loanAmount.toString(), label: 'Loan Amount' },
              { id: ':r1:', value: loanData.propertyValue.toString(), label: 'Property Value' }
            ];
            
            const textResult = [];
            
            for (const input of textInputs) {
              try {
                log.info('Filling ' + input.label + '...');
                const selector = '[id="' + input.id + '"]';
                
                // Click to focus
                await page.click(selector);
                await wait(100);
                
                // Select all and delete
                await page.keyboard.down('Control');
                await page.keyboard.press('KeyA');
                await page.keyboard.up('Control');
                await page.keyboard.press('Backspace');
                await wait(50);
                
                // Type the value (this triggers proper React events)
                await page.type(selector, input.value, { delay: 20 });
                await wait(100);
                
                // Press Tab to blur and commit the value
                await page.keyboard.press('Tab');
                await wait(200);
                
                // Verify the value
                const finalValue = await page.evaluate((id) => {
                  const el = document.querySelector('[id="' + id + '"]');
                  return el ? el.value : null;
                }, input.id);
                
                log.info(input.label + ' final value: ' + finalValue);
                
                if (finalValue === input.value || finalValue === input.value.replace(/^0+/, '')) {
                  textResult.push('✅ ' + input.label + ': ' + input.value);
                } else {
                  textResult.push('⚠️  ' + input.label + ': typed but value is ' + finalValue);
                }
              } catch (error) {
                log.info('❌ Error filling ' + input.label + ': ' + error.message);
                textResult.push('❌ ' + input.label);
              }
            }
            
            log.info('Text inputs result: ' + JSON.stringify(textResult));
            await wait(300);
            
            // STEP 2: Fill each dropdown ONE BY ONE
            log.info('Step 2: Filling dropdowns...');
            
            const dropdowns = [
              { label: 'LTV', value: ${JSON.stringify(loanData.ltv)} },
              { label: 'Loan Type', value: ${JSON.stringify(loanData.loanType)} },
              { label: 'Interest Only', value: ${JSON.stringify(loanData.interestOnly)} },
              { label: 'Loan Purpose', value: ${JSON.stringify(loanData.loanPurpose)} },
              { label: 'Property Type', value: ${JSON.stringify(loanData.propertyType)} },
              { label: 'Est. DSCR', value: ${JSON.stringify(loanData.dscr)} },
              { label: 'Stated FICO Score', value: ${JSON.stringify(loanData.ficoScore)} },
              { label: 'Prepayment Penalty', value: ${JSON.stringify(loanData.prepaymentPenalty)} },
              { label: 'TPO Premium', value: ${JSON.stringify(loanData.tpoPremium)} }
            ];
            
            const dropdownResults = [];
            
            for (const dropdown of dropdowns) {
              if (!dropdown.value) continue;

              try {
                log.info('Filling: ' + dropdown.label + ' = ' + dropdown.value);
                
                // Find the combobox div - try multiple strategies
                const comboboxResult = await page.evaluate((placeholder) => {
                  const inputs = Array.from(document.querySelectorAll('input'));
                  
                  // Specific handling for Loan Type and LTV to avoid mixing them up
                  // The site seems to have multiple inputs with similar names or roles
                  let input;
                  if (placeholder === 'Loan Type') {
                    // Look for input that is explicitly related to Loan Type
                    input = inputs.find(inp => 
                      (inp.placeholder === 'Loan Type') || 
                      (inp.getAttribute('aria-label') === 'Loan Type') ||
                      (inp.id && inp.id.includes('loanType'))
                    );
                  } else {
                    input = inputs.find(inp => inp.placeholder === placeholder);
                  }
                  
                  if (!input) {
                    return { success: false, error: 'Input not found for ' + placeholder };
                  }
                  
                  // Strategy 1: Check if input is inside a combobox (parent)
                  let element = input.parentElement;
                  while (element) {
                    if (element.getAttribute('role') === 'combobox') {
                      return { success: true, id: element.id, strategy: 'parent' };
                    }
                    element = element.parentElement;
                  }
                  
                  // Strategy 2: Check for sibling combobox
                  if (input.parentElement) {
                    const siblings = Array.from(input.parentElement.children);
                    const comboboxSibling = siblings.find(el => el.getAttribute('role') === 'combobox');
                    if (comboboxSibling && comboboxSibling.id) {
                      return { success: true, id: comboboxSibling.id, strategy: 'sibling' };
                    }
                  }
                  
                  // Strategy 3: Find nearest combobox in the same container
                  const container = input.closest('div');
                  if (container) {
                    const nearbyCombobox = container.querySelector('[role="combobox"]');
                    if (nearbyCombobox && nearbyCombobox.id) {
                      return { success: true, id: nearbyCombobox.id, strategy: 'container' };
                    }
                  }
                  
                  // Strategy 4: Find by ID pattern if we know it
                  // LTV is usually :r2:, Loan Type is usually :r4:
                  if (placeholder === 'LTV') {
                    const ltvEl = document.getElementById(':r2:-outlined') || document.getElementById(':r2:');
                    if (ltvEl) return { success: true, id: ltvEl.id, strategy: 'explicit-id' };
                  }
                  if (placeholder === 'Loan Type') {
                    const ltEl = document.getElementById(':r4:-outlined') || document.getElementById(':r4:');
                    if (ltEl) return { success: true, id: ltEl.id, strategy: 'explicit-id' };
                  }
                  
                  return { success: false, error: 'Combobox not found for ' + placeholder };
                }, dropdown.label);
                
                if (!comboboxResult.success) {
                  log.info('❌ ' + dropdown.label + ': ' + comboboxResult.error);
                  dropdownResults.push('❌ ' + dropdown.label + ' - combobox not found');
                  continue;
                }
                
                log.info('✅ Found combobox ID: ' + comboboxResult.id + ' (strategy: ' + comboboxResult.strategy + ')');
                
                // Click the combobox div using attribute selector (IDs start with : which breaks CSS)
                const selector = '[id="' + comboboxResult.id + '"]';
                
                try {
                  await page.click(selector);
                  log.info('✅ Clicked combobox: ' + dropdown.label);
                } catch (clickErr) {
                  log.info('❌ Failed to click combobox: ' + clickErr.message);
                  dropdownResults.push('❌ ' + dropdown.label + ' - click failed');
                  continue;
                }
                
                // Smart wait: Wait for dropdown options to appear instead of fixed delay
                try {
                  await page.waitForSelector('[role="option"], .MuiMenuItem-root', { timeout: 3000 });
                } catch (waitErr) {
                  log.info('⚠️  Timeout waiting for options, continuing anyway...');
                }
                
                // Try multiple selectors to find options
                const availableOptions = await page.evaluate(() => {
                  let opts = Array.from(document.querySelectorAll('[role="option"]'));
                  if (opts.length === 0) {
                    opts = Array.from(document.querySelectorAll('.MuiMenuItem-root'));
                  }
                  if (opts.length === 0) {
                    opts = Array.from(document.querySelectorAll('li[role="option"]'));
                  }
                  if (opts.length === 0) {
                    opts = Array.from(document.querySelectorAll('ul[role="listbox"] li'));
                  }
                  if (opts.length === 0) {
                    // Last resort - visible li elements
                    opts = Array.from(document.querySelectorAll('li'))
                      .filter(li => li.offsetParent !== null);
                  }
                  
                  return opts.map(o => o.textContent.trim());
                });
                
                log.info('Found ' + availableOptions.length + ' options: ' + JSON.stringify(availableOptions.slice(0, 10)));
                
                if (availableOptions.length === 0) {
                  log.info('❌ No options found for ' + dropdown.label);
                  dropdownResults.push('❌ ' + dropdown.label + ' - no options');
                  continue;
                }
                
                // Click the matching option using multiple strategies
                const optionResult = await page.evaluate((valueText) => {
                  // Try different selectors
                  let options = Array.from(document.querySelectorAll('[role="option"]'));
                  if (options.length === 0) options = Array.from(document.querySelectorAll('.MuiMenuItem-root'));
                  if (options.length === 0) options = Array.from(document.querySelectorAll('li[role="option"]'));
                  if (options.length === 0) options = Array.from(document.querySelectorAll('ul[role="listbox"] li'));
                  if (options.length === 0) {
                    options = Array.from(document.querySelectorAll('li'))
                      .filter(li => li.offsetParent !== null);
                  }
                  
                  // Normalize strings for fuzzy matching: lowercase, remove hyphens/punctuation, collapse whitespace
                  const normalize = (s) => s.toLowerCase().replace(/[-_\/\\.,;:!?()]/g, ' ').replace(/\s+/g, ' ').trim();
                  const normalizedValue = normalize(valueText);
                  
                  // Strategy 1: Exact match (case insensitive)
                  let match = options.find(opt => {
                    const text = opt.textContent.trim();
                    return text.toLowerCase() === valueText.toLowerCase();
                  });
                  
                  // Strategy 2: Normalized match (ignore hyphens, punctuation, extra spaces)
                  if (!match) {
                    match = options.find(opt => {
                      const normalizedOpt = normalize(opt.textContent.trim());
                      return normalizedOpt === normalizedValue;
                    });
                  }
                  
                  // Strategy 3: One contains the other (normalized)
                  if (!match) {
                    match = options.find(opt => {
                      const normalizedOpt = normalize(opt.textContent.trim());
                      return normalizedOpt.includes(normalizedValue) || 
                             normalizedValue.includes(normalizedOpt);
                    });
                  }
                  
                  // Strategy 4: Best fuzzy match - find the option with the most word overlap
                  if (!match) {
                    const valueWords = normalizedValue.split(' ').filter(w => w.length > 1);
                    let bestMatch = null;
                    let bestScore = 0;
                    for (const opt of options) {
                      const optWords = normalize(opt.textContent.trim()).split(' ').filter(w => w.length > 1);
                      const matchingWords = valueWords.filter(w => optWords.some(ow => ow.includes(w) || w.includes(ow)));
                      const score = matchingWords.length / Math.max(valueWords.length, optWords.length);
                      if (score > bestScore && score >= 0.5) {
                        bestScore = score;
                        bestMatch = opt;
                      }
                    }
                    match = bestMatch;
                  }
                  
                  if (match) {
                    match.click();
                    return { success: true, text: match.textContent.trim() };
                  }
                  
                  return { 
                    success: false, 
                    error: 'Option not found in list'
                  };
                }, dropdown.value);
                
                if (optionResult.success) {
                  log.info('✅ Selected: ' + optionResult.text);
                  dropdownResults.push('✅ ' + dropdown.label + ': ' + optionResult.text);
                } else {
                  log.info('⚠️  Could not find "' + dropdown.value + '" in available options');
                  dropdownResults.push('⚠️  ' + dropdown.label + ' - option not found');
                  // Close the open dropdown by pressing Escape so it doesn't interfere with the next one
                  await page.keyboard.press('Escape');
                  await wait(300);
                }
                
                // Wait for dropdown to fully close and clear from DOM
                try {
                  await page.waitForFunction(() => {
                    return document.querySelector('[role="listbox"]') === null;
                  }, { timeout: 2000 });
                } catch (e) {
                  // Force close any lingering dropdown
                  await page.keyboard.press('Escape');
                  await wait(400);
                }
                
                await wait(200); // Additional buffer for React state update
                
              } catch (err) {
                log.info('❌ Error with ' + dropdown.label + ': ' + err.message);
                dropdownResults.push('❌ ' + dropdown.label + ' error');
              }
            }
            
            log.info('Dropdown results: ' + JSON.stringify(dropdownResults));
            
            const formResult = { 
              success: true, 
              textInputs: textResult,
              dropdowns: dropdownResults
            };
            
            log.info('Form fill result: ' + JSON.stringify(formResult));
            
            await wait(300);
            
            // Try to click Calculate Rate
            log.info('Looking for Calculate Rate button...');
            const buttonResult = await page.evaluate(() => {
              try {
                const buttons = Array.from(document.querySelectorAll('button'));
                const calcButton = buttons.find(btn => 
                  btn.textContent && btn.textContent.toLowerCase().includes('calculate')
                );
                if (calcButton) {
                  calcButton.click();
                  return { clicked: true, text: calcButton.textContent };
                }
                return { clicked: false, buttonCount: buttons.length, buttonTexts: buttons.map(b => b.textContent).slice(0, 5) };
              } catch (err) {
                return { clicked: false, error: err.message };
              }
            });
            
            log.info('Button click result: ' + JSON.stringify(buttonResult));
            
            let interestRate = null;
            let rateDebugInfo = null;
            
            if (buttonResult.clicked) {
              log.info('Waiting for calculation results...');
              
              // Minimum wait for calculation to process (API call takes time)
              await wait(3000);
              
              // Smart wait: Look for actual results (rate percentage or ineligible message)
              try {
                await page.waitForFunction(() => {
                  const bodyText = document.body.innerText;
                  // Look for rate percentage pattern (e.g., "6.395%") or specific result indicators
                  const hasRatePattern = /\\d+\\.\\d{3,4}%/.test(bodyText);
                  const hasIneligible = bodyText.includes('INELIGIBLE PRODUCT');
                  const hasEligibleProducts = bodyText.includes('ELIGIBLE PRODUCTS');
                  
                  return hasRatePattern || hasIneligible || hasEligibleProducts;
                }, { timeout: 10000 });
                log.info('✅ Results appeared!');
              } catch (waitErr) {
                log.info('⚠️  Timeout waiting for results, continuing anyway...');
              }
              
              // Take screenshot for debugging
              log.info('📸 Taking screenshot after calculation...');
              await context.saveSnapshot();
              
              // Extract the interest rate with proper ineligible detection
              log.info('🔍 Extracting interest rate...');
              const rateExtraction = await page.evaluate(() => {
                try {
                  const bodyText = document.body.innerText;
                  
                  // Check for INELIGIBLE text
                  const hasIneligible = bodyText.includes('INELIGIBLE PRODUCT');
                  const hasEligible = bodyText.includes('ELIGIBLE PRODUCTS');
                  const hasBaseRates = bodyText.includes('Base Rates') || bodyText.includes('Base Rate');
                  
                  // Try to find rate first
                  let rate = null;
                  let productType = null;
                  
                  // Look for rate
                  if (true) {
                    // Strategy 1: Find percentage in format X.XXX%
                    const rateMatch = bodyText.match(/(\\d+\\.\\d{3,4}%)/);
                    if (rateMatch) {
                      rate = rateMatch[1];
                    }
                    
                    // Strategy 2: Look in right panel
                    const rightPanel = Array.from(document.querySelectorAll('div')).find(div => {
                      const text = div.textContent;
                      return (text.includes('ELIGIBLE PRODUCTS') || text.includes('Base Rate')) && 
                             text.length < 2000;
                    });
                    
                    if (rightPanel && !rate) {
                      const panelMatch = rightPanel.textContent.match(/(\\d+\\.\\d{3,4}%)/);
                      if (panelMatch) rate = panelMatch[1];
                    }
                    
                    // Strategy 3: Look for orange-colored elements
                    if (!rate) {
                      const orangeElements = Array.from(document.querySelectorAll('*')).filter(el => {
                        const style = window.getComputedStyle(el);
                        const color = style.color;
                        return (color.includes('rgb(255, 87, 34)') || 
                                color.includes('#ff5722')) &&
                               el.textContent.trim().match(/^\\d+\\.\\d+%$/);
                      });
                      
                      if (orangeElements.length > 0) {
                        rate = orangeElements[0].textContent.trim();
                      }
                    }
                    
                    // Find product type
                    if (bodyText.includes('30 YR Fixed Rate')) {
                      productType = '30 YR Fixed Rate';
                    } else if (bodyText.includes('10/6 ARM')) {
                      productType = '10/6 ARM (30 YR)';
                    } else if (bodyText.includes('7/6 ARM')) {
                      productType = '7/6 ARM (30 YR)';
                    } else if (bodyText.includes('5/6 ARM')) {
                      productType = '5/6 ARM (30 YR)';
                    }
                  }
                  
                  // If no rate found AND INELIGIBLE text exists, mark as ineligible
                  if (!rate && hasIneligible) {
                    return {
                      success: false,
                      isIneligible: true,
                      message: 'Loan is ineligible',
                      hasEligible: hasEligible,
                      hasIneligible: hasIneligible,
                      hasBaseRates: hasBaseRates
                    };
                  }
                  
                  // Return result
                  return {
                    success: !!rate,
                    isIneligible: false,
                    rate: rate,
                    productType: productType,
                    hasEligible: hasEligible,
                    hasIneligible: hasIneligible,
                    hasBaseRates: hasBaseRates,
                    bodySnippet: bodyText.substring(0, 2000)
                  };
                } catch (err) {
                  return { success: false, error: err.message };
                }
              });
              
              log.info('📊 Rate Extraction Result:');
              
              if (rateExtraction.isIneligible) {
                log.info('❌ LOAN IS INELIGIBLE');
                log.info('Message: ' + rateExtraction.message);
                interestRate = null;
                rateDebugInfo = rateExtraction;
              } else if (rateExtraction.success && rateExtraction.rate) {
                log.info('✅ SUCCESS! Interest Rate: ' + rateExtraction.rate);
                if (rateExtraction.productType) {
                  log.info('Product Type: ' + rateExtraction.productType);
                }
                interestRate = rateExtraction.rate;
                rateDebugInfo = rateExtraction;
              } else {
                log.info('⚠️  Could not extract rate from page');
                log.info('Has Eligible: ' + rateExtraction.hasEligible);
                log.info('Has Ineligible: ' + rateExtraction.hasIneligible);
                log.info('Has Base Rates: ' + rateExtraction.hasBaseRates);
                log.info('Body snippet: ' + rateExtraction.bodySnippet);
                interestRate = null;
                rateDebugInfo = rateExtraction;
              }
            }
            
            // Return results
            const isIneligible = rateDebugInfo && rateDebugInfo.isIneligible;
            
            return {
              success: interestRate !== null && !isIneligible,
              interestRate: interestRate,
              isIneligible: isIneligible,
              message: isIneligible ? 'Loan is ineligible' : null,
              url: request.url,
              pageTitle: await page.title(),
              formResult: formResult,
              buttonResult: buttonResult,
              rateDebugInfo: rateDebugInfo,
              loanData: loanData
            };
            
          } catch (error) {
            log.error('Error in pageFunction: ' + error.message);
            return {
              success: false,
              error: error.message,
              stack: error.stack
            };
          }
        }`,
        proxyConfiguration: {
          useApifyProxy: true
        },
        maxRequestsPerCrawl: 1,
        maxConcurrency: 1
      });
      
      console.log(`✅ Apify run started: ${run.id}`);
      
      // Wait for run to finish
      console.log('⏳ Waiting for Apify to complete...');
      await client.run(run.id).waitForFinish();
      
      // Fetch results from dataset
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      console.log('📊 Results:', JSON.stringify(items, null, 2));
      
      if (items && items.length > 0) {
        const result = items[0];
        
        // Log completion
        await storage.logPricingRequest({
          requestData: loanData,
          responseData: result,
          status: 'success'
        });

        if (result.isIneligible) {
          res.json({
            success: false,
            isIneligible: true,
            message: 'Loan is ineligible',
            loanData: result.loanData,
            apifyRunId: run.id
          });
        } else if (result.success && result.interestRate) {
          let parsedRate = parseFloat(String(result.interestRate).replace('%', ''));
          res.json({
            success: true,
            interestRate: parsedRate,
            loanData: result.loanData,
            apifyRunId: run.id
          });
        } else {
          res.status(400).json({
            success: false,
            error: 'Could not extract interest rate from page',
            apifyRunId: run.id,
            debug: result
          });
        }
      } else {
        await storage.logPricingRequest({
          requestData: loanData,
          status: 'error',
          responseData: { error: 'No results from Apify' }
        });
        res.status(500).json({
          success: false,
          error: 'No results from Apify',
          apifyRunId: run.id
        });
      }
      
    } catch (error) {
      console.error('❌ Apify error:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          message: error.errors[0].message
        });
      } else {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });

  // Quotes API endpoints (Protected)
  app.post(api.quotes.save.path, authenticateUser, async (req: AuthRequest, res) => {
    try {
      const quoteData = api.quotes.save.input.parse(req.body);
      
      // Detect if this is an RTL quote
      const isRTLQuote = quoteData.loanData?.asIsValue || quoteData.loanData?.arv || quoteData.loanData?.rehabBudget !== undefined;
      
      let pointsAmount = 0;
      let tpoPremiumAmount = 0;
      let totalRevenue = 0;
      let commission = 0;
      
      if (isRTLQuote) {
        // RTL quote: commission is the additional points (above 2 minimum) on max loan
        const asIsValue = quoteData.loanData?.asIsValue || 0;
        const rehabBudget = quoteData.loanData?.rehabBudget || 0;
        const totalCost = asIsValue + rehabBudget;
        const additionalPoints = Math.max(0, quoteData.pointsCharged - 2);
        
        // Points amount for RTL is the additional points amount (commission)
        pointsAmount = (totalCost * additionalPoints) / 100;
        commission = pointsAmount; // For RTL, commission IS the additional points amount
        totalRevenue = (totalCost * quoteData.pointsCharged) / 100;
      } else {
        // DSCR quote: commission is everything above 1 point minimum
        const loanAmount = quoteData.loanData?.loanAmount || 0;
        const tpoPremiumPercent = quoteData.loanData?.tpoPremium ? parseFloat(String(quoteData.loanData.tpoPremium).replace('%', '')) : 0;
        const dscrAdditionalPoints = Math.max(0, quoteData.pointsCharged - 1);
        
        tpoPremiumAmount = (loanAmount * tpoPremiumPercent) / 100;
        pointsAmount = (loanAmount * quoteData.pointsCharged) / 100;
        totalRevenue = pointsAmount + tpoPremiumAmount;
        commission = (loanAmount * dscrAdditionalPoints) / 100; // Commission = additional points above 1 min
      }
      
      const saved = await storage.saveQuote({
        ...quoteData,
        pointsAmount,
        tpoPremiumAmount,
        totalRevenue,
        commission,
        // Persist YSP + split points
        yspAmount: quoteData.yspAmount ?? 0,
        yspRateImpact: quoteData.yspRateImpact ?? 0,
        yspDollarAmount: quoteData.yspDollarAmount ?? 0,
        basePointsCharged: quoteData.basePointsCharged ?? 0,
        brokerPointsCharged: quoteData.brokerPointsCharged ?? 0,
      }, req.user!.id);

      // Auto-populate document checklist based on programId or loan type
      const quoteLoanType = (saved.loanData as any)?.loanType;
      if ((saved.programId || quoteLoanType) && saved.id) {
        try {
          let activeProgram: any = null;
          if (saved.programId) {
            const [prog] = await db.select().from(loanPrograms)
              .where(and(
                eq(loanPrograms.id, saved.programId),
                eq(loanPrograms.isActive, true)
              ))
              .limit(1);
            activeProgram = prog;
          }
          if (!activeProgram && quoteLoanType) {
            const [prog] = await db.select().from(loanPrograms)
              .where(and(
                eq(loanPrograms.loanType, quoteLoanType),
                eq(loanPrograms.isActive, true)
              ))
              .limit(1);
            activeProgram = prog;
          }

          let documentEntries: any[] = [];

          if (activeProgram) {
            const programDocs = await db.select().from(programDocumentTemplates)
              .where(eq(programDocumentTemplates.programId, activeProgram.id))
              .orderBy(programDocumentTemplates.sortOrder);

            documentEntries = programDocs.map((doc, index) => ({
              dealId: saved.id,
              documentName: doc.documentName,
              documentCategory: doc.documentCategory,
              documentDescription: doc.documentDescription,
              isRequired: doc.isRequired,
              assignedTo: doc.assignedTo || 'borrower',
              visibility: doc.visibility || 'all',
              sortOrder: doc.sortOrder || index,
              status: 'pending',
            }));
          } else {
            const fallbackTemplates = getDocumentTemplatesForLoanType(quoteLoanType);
            documentEntries = fallbackTemplates.map((template, index) => ({
              dealId: saved.id,
              documentName: template.name,
              documentCategory: template.category,
              documentDescription: template.description || null,
              isRequired: template.isRequired,
              sortOrder: index,
              status: 'pending',
            }));
          }

          if (documentEntries.length > 0) {
            await db.insert(dealDocuments).values(documentEntries);
          }
        } catch (docError) {
          console.error('Non-critical: Failed to auto-populate documents for quote:', docError);
        }
      }

      res.json({ success: true, quote: saved });
    } catch (error) {
      console.error('Error saving quote:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Validation error', message: error.errors[0].message });
      } else {
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }
  });

  app.get(api.quotes.list.path, authenticateUser, async (req: AuthRequest, res) => {
    try {
      const quotes = await storage.getQuotes(req.user!.id);
      res.json({ success: true, quotes });
    } catch (error) {
      console.error('Error fetching quotes:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/quotes/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const quote = await storage.getQuoteById(id, req.user!.id);
      if (!quote) {
        res.status(404).json({ success: false, error: 'Quote not found' });
        return;
      }
      res.json({ success: true, quote });
    } catch (error) {
      console.error('Error fetching quote:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete('/api/quotes/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteQuote(id, req.user!.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting quote:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Accept a quote (borrower flow) — creates a project/deal on the admin dashboard
  app.post('/api/quotes/:id/accept', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const quoteId = parseInt(req.params.id);
      const userId = req.user!.id;
      const user = await storage.getUserById(userId);
      if (!user) {
        res.status(401).json({ success: false, error: 'User not found' });
        return;
      }

      const quote = await storage.getQuoteById(quoteId, userId);
      if (!quote) {
        res.status(404).json({ success: false, error: 'Quote not found' });
        return;
      }

      // Prevent duplicate accepts — check if a project already exists for this quote
      const existingProjects = await db.select({ id: projects.id })
        .from(projects)
        .where(eq(projects.quoteId, quoteId))
        .limit(1);
      if (existingProjects.length > 0) {
        res.status(409).json({ success: false, error: 'This quote has already been accepted' });
        return;
      }

      const loanData = quote.loanData as Record<string, any>;
      const isRTLQuote = loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined;
      const loanAmount = isRTLQuote
        ? (loanData?.asIsValue || 0) + (loanData?.rehabBudget || 0)
        : loanData?.loanAmount || 0;

      const rateStr = quote.interestRate || '';
      const rateNum = parseFloat(rateStr.replace('%', ''));

      const projectNumber = await storage.generateProjectNumber();
      const borrowerToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');

      const borrowerName = `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim() || user.fullName || user.email;
      const borrowerEmail = user.email || '';

      const { project, projectNumber: pn } = await db.transaction(async (tx) => {
        const [proj] = await tx.insert(projects).values({
          userId,
          projectName: `${borrowerName} — ${quote.propertyAddress || 'New Loan'}`,
          projectNumber,
          loanAmount: loanAmount || null,
          interestRate: !isNaN(rateNum) ? rateNum : null,
          loanTermMonths: loanData?.loanTermMonths ? parseInt(loanData.loanTermMonths) : null,
          loanType: loanData?.loanType || (isRTLQuote ? 'fix_and_flip' : 'dscr'),
          programId: quote.programId || null,
          propertyAddress: quote.propertyAddress || null,
          propertyType: loanData?.propertyType || null,
          borrowerName,
          borrowerEmail,
          borrowerPhone: user.phone || null,
          status: 'active',
          currentStage: 'documentation',
          progressPercentage: 0,
          applicationDate: new Date(),
          targetCloseDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          borrowerPortalToken: borrowerToken,
          borrowerPortalEnabled: true,
          quoteId: quoteId,
          notes: `Accepted from borrower quote #${quoteId}`,
          metadata: { applicationData: loanData },
        }).returning();

        if (quote.propertyAddress) {
          const ld = quote.loanData as Record<string, any>;
          await tx.insert(dealProperties).values({
            dealId: proj.id,
            address: quote.propertyAddress,
            propertyType: ld?.propertyType || null,
            estimatedValue: ld?.propertyValue || ld?.asIsValue || null,
            isPrimary: true,
            sortOrder: 0,
          });
          const additionalProps = (ld?.additionalProperties || []) as Array<Record<string, any>>;
          for (let i = 0; i < additionalProps.length; i++) {
            const ap = additionalProps[i];
            if (ap.address) {
              await tx.insert(dealProperties).values({
                dealId: proj.id,
                address: ap.address,
                propertyType: ap.propertyType || null,
                estimatedValue: ap.estimatedValue || null,
                isPrimary: false,
                sortOrder: i + 1,
              });
            }
          }
        }

        // Create stages/tasks/documents from program template
        const { buildProjectPipelineFromProgram } = await import('./services/projectPipeline');
        const pipelineResult = await buildProjectPipelineFromProgram(
          proj.id,
          quote.programId || null,
          undefined,
          tx
        );
        console.log(`Borrower quote accepted → Project ${projectNumber} created: ${pipelineResult.stagesCreated} stages, ${pipelineResult.tasksCreated} tasks, ${pipelineResult.documentsCreated} documents`);

        await tx.insert(projectActivity).values({
          projectId: proj.id,
          userId,
          activityType: 'project_created',
          activityDescription: `Loan application submitted by borrower from quote #${quoteId}`,
          visibleToBorrower: true,
        });

        return { project: proj, projectNumber: proj.projectNumber };
      });

      // Trigger webhook
      const { triggerWebhook } = await import('./utils/webhooks');
      await triggerWebhook(project.id, 'project_created', {
        project_number: projectNumber,
        source: 'borrower_quote_accepted',
        quote_id: quoteId,
      });

      // Google Drive folder creation (non-blocking)
      try {
        const { isDriveIntegrationEnabled, ensureProjectFolder } = await import('./services/googleDrive');
        const driveEnabled = await isDriveIntegrationEnabled();
        if (driveEnabled) {
          ensureProjectFolder(project.id).catch((err: any) => {
            console.error(`Drive folder creation failed for deal ${project.id}:`, err.message);
          });
        }
      } catch (e) {
        // Drive integration not critical
      }

      res.json({
        success: true,
        project: {
          id: project.id,
          projectNumber: project.projectNumber,
          projectName: project.projectName,
        },
        message: 'Quote accepted and loan application created successfully',
      });
    } catch (error) {
      console.error('Error accepting quote:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ========== DOCUMENT SIGNING ENDPOINTS (Protected) ==========

  // Create a new document (upload PDF)
  app.post('/api/documents', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const { quoteId, name, fileName, fileData, pageCount } = req.body;
      
      if (!name || !fileName || !fileData) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }
      const userId = req.user!.id;

      const doc = await storage.createDocument({
        quoteId: quoteId || null,
        name,
        fileName,
        fileData,
        pageCount: pageCount || 1,
        status: 'draft'
      }, userId);

      await storage.createAuditLog({
        documentId: doc.id,
        action: 'created',
        details: `Document "${name}" created`,
        ipAddress: req.ip
      });

      res.json({ success: true, document: doc });
    } catch (error) {
      console.error('Error creating document:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // List all documents
  app.get('/api/documents', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const docs = await storage.getDocuments(req.user!.id);
      const documentsWithSigners = await Promise.all(
        docs.map(async (doc) => {
          const signers = await storage.getSignersByDocumentId(doc.id);
          return { ...doc, signers };
        })
      );
      res.json({ success: true, documents: documentsWithSigners });
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get document by ID
  app.get('/api/documents/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const doc = await storage.getDocumentById(id, req.user!.id);
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }
      
      const signers = await storage.getSignersByDocumentId(id);
      const fields = await storage.getFieldsByDocumentId(id);
      
      res.json({ success: true, document: doc, signers, fields });
    } catch (error) {
      console.error('Error fetching document:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get documents by quote ID with signers
  app.get('/api/quotes/:quoteId/documents', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      const docs = await storage.getDocumentsByQuoteId(quoteId, req.user!.id);
      
      // Fetch signers for each document
      const documentsWithSigners = await Promise.all(
        docs.map(async (doc) => {
          const signers = await storage.getSignersByDocumentId(doc.id);
          return { ...doc, signers };
        })
      );
      
      res.json({ success: true, documents: documentsWithSigners });
    } catch (error) {
      console.error('Error fetching documents for quote:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete document
  app.delete('/api/documents/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteDocument(id, req.user!.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Add signer to document
  app.post('/api/documents/:id/signers', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { name, email, color, signingOrder } = req.body;

      // Verify user owns this document
      const doc = await storage.getDocumentById(documentId, userId);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      if (!name || !email) {
        res.status(400).json({ success: false, error: 'Name and email are required' });
        return;
      }

      const signer = await storage.createSigner({
        documentId,
        name,
        email,
        color: color || '#3B82F6',
        signingOrder: signingOrder || 1,
        status: 'pending'
      });

      res.json({ success: true, signer });
    } catch (error) {
      console.error('Error adding signer:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete signer
  app.delete('/api/signers/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Get signer and verify ownership through document
      const signer = await storage.getSignerById(id);
      if (!signer) {
        return res.status(404).json({ success: false, error: 'Signer not found' });
      }
      const doc = await storage.getDocumentById(signer.documentId, userId);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      
      await storage.deleteSigner(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting signer:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Add field to document
  app.post('/api/documents/:id/fields', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { signerId, pageNumber, fieldType, x, y, width, height, required, label, value } = req.body;

      // Verify user owns this document
      const doc = await storage.getDocumentById(documentId, userId);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      const field = await storage.createField({
        documentId,
        signerId: signerId || null,
        pageNumber: pageNumber || 1,
        fieldType,
        x,
        y,
        width,
        height,
        required: required !== false,
        label,
        value: value || null // Save pre-populated field value
      });

      res.json({ success: true, field });
    } catch (error) {
      console.error('Error adding field:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update field
  app.patch('/api/fields/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user!.id;
      const updates = req.body;
      
      // Get field and verify ownership through document
      const existingField = await storage.getFieldById(id);
      if (!existingField) {
        return res.status(404).json({ success: false, error: 'Field not found' });
      }
      const doc = await storage.getDocumentById(existingField.documentId, userId);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      
      const field = await storage.updateField(id, updates);
      res.json({ success: true, field });
    } catch (error) {
      console.error('Error updating field:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete field
  app.delete('/api/fields/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Get field and verify ownership through document
      const existingField = await storage.getFieldById(id);
      if (!existingField) {
        return res.status(404).json({ success: false, error: 'Field not found' });
      }
      const doc = await storage.getDocumentById(existingField.documentId, userId);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      
      await storage.deleteField(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting field:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Save all fields for a document (bulk update)
  app.post('/api/documents/:id/fields/bulk', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { fields } = req.body;
      
      // Verify user owns this document
      const doc = await storage.getDocumentById(documentId, userId);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      
      console.log(`📝 Saving ${fields?.length || 0} fields for document ${documentId}`);

      if (!Array.isArray(fields)) {
        return res.status(400).json({ success: false, error: 'Fields must be an array' });
      }

      const safeNum = (val: any, fallback: number): number => {
        const n = Number(val);
        return Number.isFinite(n) ? n : fallback;
      };

      const safeInt = (val: any): number | null => {
        if (val === null || val === undefined) return null;
        const n = parseInt(val, 10);
        return Number.isFinite(n) ? n : null;
      };

      const { signers: signerData } = req.body;
      
      const existingSigners = await storage.getSignersByDocumentId(documentId);
      const existingSignerIds = new Set(existingSigners.map(s => s.id));
      
      const signerIdMap = new Map<number, number>();
      
      if (Array.isArray(signerData) && signerData.length > 0) {
        for (const s of signerData) {
          if (s.id && existingSignerIds.has(s.id)) {
            signerIdMap.set(s.id, s.id);
          } else {
            const newSigner = await storage.createSigner({
              documentId,
              name: s.name || 'Signer',
              email: s.email || '',
              color: s.color || '#3B82F6',
              signingOrder: s.signingOrder || 1,
              status: 'pending'
            });
            signerIdMap.set(s.id || newSigner.id, newSigner.id);
          }
        }
      } else {
        for (const s of existingSigners) {
          signerIdMap.set(s.id, s.id);
        }
      }

      const validatedFields = fields.map((field: any, idx: number) => {
        let signerId = safeInt(field.signerId);
        if (signerId !== null && signerIdMap.has(signerId)) {
          signerId = signerIdMap.get(signerId)!;
        } else if (signerId !== null && !existingSignerIds.has(signerId)) {
          signerId = null;
        }
        const pageNumber = safeNum(field.pageNumber, 1);
        const x = safeNum(field.x, 0);
        const y = safeNum(field.y, 0);
        const width = safeNum(field.width, 100);
        const height = safeNum(field.height, 30);

        if (!field.fieldType || typeof field.fieldType !== 'string') {
          throw new Error(`Field ${idx}: missing or invalid fieldType`);
        }

        return {
          documentId,
          signerId,
          pageNumber: Math.max(1, Math.round(pageNumber)),
          fieldType: field.fieldType,
          x,
          y,
          width: Math.max(10, width),
          height: Math.max(10, height),
          required: field.required !== false,
          label: field.label || null,
          value: field.value || null
        };
      });

      // Delete existing fields
      await storage.deleteFieldsByDocumentId(documentId);

      // Create new fields
      const createdFields = [];
      for (const fieldData of validatedFields) {
        const created = await storage.createField(fieldData);
        createdFields.push(created);
      }

      const signerIdMapping = Object.fromEntries(signerIdMap.entries());
      const updatedSigners = await storage.getSignersByDocumentId(documentId);
      res.json({ success: true, fields: createdFields, signerIdMapping, signers: updatedSigners });
    } catch (error) {
      console.error('Error saving fields:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Send document for signing
  app.post('/api/documents/:id/send', authenticateUser, async (_req: AuthRequest, res) => {
    res.status(410).json({ 
      success: false, 
      error: 'Deprecated: must send via PandaDoc. Use POST /api/documents/:id/pandadoc/send' 
    });
  });

  app.post('/api/pandadoc/debug-field-placement', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const { email, name } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: 'email and name are required' });
      }
      const pandadoc = await import('./esign/pandadoc');
      const result = await pandadoc.createCalibrationDocument(email, name);
      res.json({
        success: true,
        ...result,
        instructions: 'Open the editor URL and check if signature (y=150), date (y=300), initials (y=450), and text (y=600) align with their reference lines.',
        currentEnvOffsets: {
          SIGNATURE_Y_OFFSET_RATIO: process.env.SIGNATURE_Y_OFFSET_RATIO || '0 (default)',
          DATE_Y_OFFSET_RATIO: process.env.DATE_Y_OFFSET_RATIO || '0 (default)',
          INITIALS_Y_OFFSET_RATIO: process.env.INITIALS_Y_OFFSET_RATIO || '0 (default)',
        },
      });
    } catch (e: any) {
      console.error('[PandaDoc Calibration] Error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/documents/:id/pandadoc/preview-mapping', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      const doc = await storage.getDocumentById(documentId, userId);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      
      const docFields = await storage.getFieldsByDocumentId(documentId);
      
      const base64Data = doc.fileData.replace(/^data:application\/pdf;base64,/, '');
      const pdfBuffer = Buffer.from(base64Data, 'base64');
      const { PDFDocument: PDFLib } = await import('pdf-lib');
      const pdfDoc = await PDFLib.load(pdfBuffer);
      const pages = pdfDoc.getPages();
      const pdfPageDims = pages.map(p => ({ width: p.getWidth(), height: p.getHeight() }));
      
      const SIGNER_TYPES = new Set(['signature', 'initial', 'initials', 'date']);
      
      const mappedFields = docFields.slice(0, 10).map(f => {
        const pageDims = pdfPageDims[f.pageNumber - 1] || { width: 612, height: 792 };
        const isSigner = SIGNER_TYPES.has(f.fieldType) || (f.fieldType === 'text' && !f.value);
        return {
          fieldType: f.fieldType,
          category: isSigner ? 'signer-interactive' : 'prefilled-burned',
          page: f.pageNumber,
          uiCoords: { x: f.x, y: f.y, w: f.width, h: f.height },
          pandadocCoords: isSigner ? { offset_x: Math.round(f.x), offset_y: Math.round(f.y), w: Math.round(f.width), h: Math.round(f.height) } : 'N/A (burned into PDF)',
          pdfPageDims: pageDims,
          value: f.value || null,
          yFlipApplied: false,
        };
      });
      
      res.json({
        documentId,
        totalFields: docFields.length,
        pdfPageDims,
        coordinateSystem: 'top-left origin (PandaDoc topleft anchor)',
        yFlipApplied: false,
        fields: mappedFields,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Send document via PandaDoc (create + send in one flow)
  app.post('/api/documents/:id/pandadoc/send', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { subject, message } = req.body;

      console.log(`[PandaDoc Send] Starting for document ${documentId}`);

      if (!documentId || isNaN(documentId)) {
        return res.status(400).json({ success: false, error: 'Invalid document ID' });
      }

      const doc = await storage.getDocumentById(documentId, userId);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      const docSigners = await storage.getSignersByDocumentId(documentId);
      if (docSigners.length === 0) {
        return res.status(400).json({ success: false, error: 'No signers added to document' });
      }

      const docFields = await storage.getFieldsByDocumentId(documentId);

      // Validate all field coordinates are valid numbers
      for (const field of docFields) {
        if (!Number.isFinite(field.x) || !Number.isFinite(field.y) ||
            !Number.isFinite(field.width) || !Number.isFinite(field.height)) {
          return res.status(400).json({ 
            success: false, 
            error: `Invalid coordinates on field "${field.fieldType}" (page ${field.pageNumber})`,
            fieldName: field.fieldType,
            value: { x: field.x, y: field.y, width: field.width, height: field.height }
          });
        }
        if (!Number.isInteger(field.pageNumber) || field.pageNumber < 1) {
          return res.status(400).json({
            success: false,
            error: `Invalid page number on field "${field.fieldType}"`,
            fieldName: field.fieldType,
            value: field.pageNumber
          });
        }
      }

      // Convert base64 PDF to buffer
      let pdfBuffer: Buffer;
      try {
        const base64Data = doc.fileData.replace(/^data:application\/pdf;base64,/, '');
        pdfBuffer = Buffer.from(base64Data, 'base64');
      } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid PDF data stored for this document' });
      }

      // Build PandaDoc recipients from signers
      const recipients = docSigners.map((signer, idx) => {
        const nameParts = signer.name.trim().split(/\s+/);
        return {
          email: signer.email,
          first_name: nameParts[0] || 'Signer',
          last_name: nameParts.slice(1).join(' ') || `${idx + 1}`,
          role: `Signer ${idx + 1}`,
        };
      });

      // Build a signer-to-role map for field assignment
      const signerRoleMap = new Map<number, string>();
      docSigners.forEach((signer, idx) => {
        signerRoleMap.set(signer.id, `Signer ${idx + 1}`);
      });

      const SIGNER_FIELD_TYPES = new Set(['signature', 'initial', 'initials', 'date']);
      
      const fieldTypeMap: Record<string, string> = {
        'signature': 'signature',
        'initial': 'initials',
        'initials': 'initials',
        'date': 'date',
        'text': 'text',
      };

      const signerFields = docFields.filter(f => SIGNER_FIELD_TYPES.has(f.fieldType) || (f.fieldType === 'text' && !f.value));
      const prefilledFields = docFields.filter(f => !SIGNER_FIELD_TYPES.has(f.fieldType) && f.value);

      console.log(`[PandaDoc Send] Fields: ${signerFields.length} signer-interactive, ${prefilledFields.length} prefilled (burned into PDF)`);

      // Get actual PDF page dimensions for coordinate normalization
      const { PDFDocument: PDFLib, StandardFonts, rgb } = await import('pdf-lib');
      const pdfDoc = await PDFLib.load(pdfBuffer);
      const pages = pdfDoc.getPages();
      const pdfPageDims = pages.map(p => ({ width: p.getWidth(), height: p.getHeight() }));
      console.log(`[PandaDoc Send] PDF page dimensions:`, JSON.stringify(pdfPageDims));

      // Burn prefilled text values directly into the PDF using pdf-lib
      // This makes them permanent, non-editable text on the document
      if (prefilledFields.length > 0) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const field of prefilledFields) {
          const pageIndex = field.pageNumber - 1;
          if (pageIndex < 0 || pageIndex >= pages.length) continue;

          const page = pages[pageIndex];
          const pageHeight = page.getHeight();
          const value = field.value || '';
          if (!value) continue;

          const fontSize = Math.min(Math.max(field.height * 0.55, 8), 16);
          const textY = pageHeight - field.y - field.height + (field.height - fontSize) / 2 + fontSize * 0.15;

          page.drawText(value, {
            x: field.x + 4,
            y: textY,
            size: fontSize,
            font,
            color: rgb(0.1, 0.1, 0.1),
            maxWidth: field.width - 8,
          });
        }

        pdfBuffer = Buffer.from(await pdfDoc.save());
        console.log(`[PandaDoc Send] Burned ${prefilledFields.length} prefilled values into PDF`);
      }

      console.log(`[PandaDoc Send] Creating document with ${recipients.length} recipients`);

      const pandadoc = await import('./esign/pandadoc');

      // Step 1: Create document from modified PDF (prefilled values already burned in)
      const pandaDoc = await pandadoc.createDocumentFromPdf(pdfBuffer, {
        name: doc.name || `Term Sheet - ${doc.fileName}`,
        recipients,
      });

      console.log(`[PandaDoc Send] Document created: ${pandaDoc.id}, status: ${pandaDoc.status}`);

      // Step 2: Wait for document to reach draft status
      await pandadoc.waitForDocumentReady(pandaDoc.id);
      console.log(`[PandaDoc Send] Document ready (draft)`);

      // Step 3: Get recipient UUIDs from PandaDoc to map our signers
      const pandaDocDetails = await pandadoc.getDocumentDetails(pandaDoc.id);
      const pandaRecipients = pandaDocDetails.recipients || [];

      // Build role-to-recipientUUID map
      const roleToRecipientUuid = new Map<string, string>();
      pandaRecipients.forEach((r: any) => {
        const matchingRole = recipients.find(
          orig => orig.email === r.email
        );
        if (matchingRole) {
          roleToRecipientUuid.set(matchingRole.role, r.id);
        }
      });
      if (pandaRecipients.length === 1) {
        roleToRecipientUuid.set('Signer 1', pandaRecipients[0].id);
      }

      console.log(`[PandaDoc Send] Mapped ${roleToRecipientUuid.size} recipient UUIDs`);

      // Step 4: Inject only signer-interactive fields (signature, initials, date, empty text)
      // Coordinates from frontend are in react-pdf viewport units (scale 1.0).
      // For standard US Letter, viewport = 612x792 = PDF points.
      // We normalize to the actual PDF page dimensions to handle non-standard page sizes.
      if (signerFields.length > 0) {
        const fieldsToInject = signerFields.map((field, idx) => {
          const role = field.signerId ? (signerRoleMap.get(field.signerId) || 'Signer 1') : 'Signer 1';
          const recipientUuid = roleToRecipientUuid.get(role) || pandaRecipients[0]?.id;
          if (!recipientUuid) {
            throw new Error(`No PandaDoc recipient UUID found for role "${role}". Cannot assign field "${field.fieldType}" on page ${field.pageNumber}.`);
          }
          const pandadocType = fieldTypeMap[field.fieldType] || 'text';
          const pageDims = pdfPageDims[field.pageNumber - 1] || { width: 612, height: 792 };
          
          const viewportWidth = doc.pageDimensions?.[field.pageNumber - 1]?.width || pageDims.width;
          const viewportHeight = doc.pageDimensions?.[field.pageNumber - 1]?.height || pageDims.height;
          
          const scaleX = pageDims.width / viewportWidth;
          const scaleY = pageDims.height / viewportHeight;

          return {
            name: `${field.fieldType}_${idx}`,
            type: pandadocType,
            assignedToRecipientUuid: recipientUuid,
            page: field.pageNumber,
            offsetX: Math.round(field.x * scaleX),
            offsetY: Math.round(field.y * scaleY),
            width: Math.round(field.width * scaleX),
            height: Math.round(field.height * scaleY),
            required: field.required ?? true,
            pageHeight: pageDims.height,
          };
        });

        const injectionResult = await pandadoc.injectDocumentFields(pandaDoc.id, fieldsToInject);
        console.log(`[PandaDoc Send] Injected ${injectionResult.fields?.length || 0} signer fields successfully`);
      }

      console.log(`[PandaDoc Send] Sending document...`);

      // Try to send the document via PandaDoc API
      const editorUrl = `https://app.pandadoc.com/a/#/documents/${pandaDoc.id}`;
      let apiSendSucceeded = false;
      let sendFallbackReason: string | null = null;

      try {
        const sendResult = await pandadoc.sendDocument(pandaDoc.id, {
          subject: subject || `Please sign: ${doc.name}`,
          message: message || 'Please review and sign the attached document.',
          silent: false,
        });
        console.log(`[PandaDoc Send] Document sent successfully: ${sendResult.id}, status: ${sendResult.status}`);
        apiSendSucceeded = true;
      } catch (sendError: any) {
        const errorMsg = sendError.message || '';
        if (errorMsg.includes('outside of your organization') || errorMsg.includes('403')) {
          console.log(`[PandaDoc Send] API send blocked (external org restriction). Falling back to editor URL.`);
          sendFallbackReason = 'Your PandaDoc plan restricts API sending to external recipients. The document has been created in PandaDoc — open the editor to send it manually.';
        } else {
          throw sendError;
        }
      }

      // Update local document with PandaDoc metadata
      await storage.updateDocument(documentId, {
        status: apiSendSucceeded ? 'sent' : 'draft',
        vendor: 'pandadoc',
        pandadocDocumentId: pandaDoc.id,
        sentAt: apiSendSucceeded ? new Date() : undefined,
      });

      // Update signer statuses
      for (const signer of docSigners) {
        await storage.updateSigner(signer.id, { status: apiSendSucceeded ? 'sent' : 'pending' });
      }

      // Create audit log
      await storage.createAuditLog({
        documentId,
        action: apiSendSucceeded ? 'sent_via_pandadoc' : 'created_in_pandadoc',
        details: apiSendSucceeded
          ? `Document sent via PandaDoc (ID: ${pandaDoc.id}) to ${docSigners.length} signer(s)`
          : `Document created in PandaDoc (ID: ${pandaDoc.id}) — manual send required via editor`,
        ipAddress: req.ip,
      });

      // Find the project/deal linked to this quote (if any)
      let linkedProjectId: number | null = null;
      if (doc.quoteId) {
        const [linkedProject] = await db.select({ id: projects.id })
          .from(projects)
          .where(eq(projects.quoteId, doc.quoteId))
          .limit(1);
        if (linkedProject) {
          linkedProjectId = linkedProject.id;
        }
      }

      // Create esign envelope record for tracking
      await db.insert(esignEnvelopes).values({
        vendor: 'pandadoc',
        quoteId: doc.quoteId,
        projectId: linkedProjectId,
        externalDocumentId: pandaDoc.id,
        documentName: doc.name,
        status: apiSendSucceeded ? 'sent' : 'draft',
        recipients: JSON.stringify(recipients.map(r => ({
          name: `${r.first_name} ${r.last_name}`.trim(),
          email: r.email,
          role: r.role,
          status: apiSendSucceeded ? 'sent' : 'pending',
        }))),
        sendMethod: 'email',
        sentAt: apiSendSucceeded ? new Date() : null,
        createdBy: userId,
      });

      res.json({
        success: true,
        providerDocumentId: pandaDoc.id,
        status: apiSendSucceeded ? 'sent' : 'created',
        editorUrl,
        recipients: recipients.map(r => ({ email: r.email, name: `${r.first_name} ${r.last_name}`.trim() })),
        requiresManualSend: !apiSendSucceeded,
        fallbackReason: sendFallbackReason,
      });
    } catch (error) {
      console.error('[PandaDoc Send] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // Get signing page data by token
  app.get('/api/sign/:token', async (req, res) => {
    try {
      const { token } = req.params;
      
      const signer = await storage.getSignerByToken(token);
      if (!signer) {
        res.status(404).json({ success: false, error: 'Invalid signing link' });
        return;
      }

      if (signer.tokenExpiresAt && new Date(signer.tokenExpiresAt) < new Date()) {
        res.status(410).json({ success: false, error: 'Signing link has expired' });
        return;
      }

      if (signer.status === 'signed') {
        res.status(400).json({ success: false, error: 'Document already signed' });
        return;
      }

      const doc = await storage.getDocumentById(signer.documentId);
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      // Get only fields assigned to this signer
      const allFields = await storage.getFieldsByDocumentId(signer.documentId);
      const signerFields = allFields.filter(f => f.signerId === signer.id);

      // Update signer status to viewed
      if (signer.status === 'sent') {
        await storage.updateSigner(signer.id, { status: 'viewed' });
        await storage.createAuditLog({
          documentId: doc.id,
          signerId: signer.id,
          action: 'viewed',
          details: `${signer.name} viewed the document`,
          ipAddress: req.ip
        });
      }

      res.json({
        success: true,
        document: {
          id: doc.id,
          name: doc.name,
          fileData: doc.fileData,
          pageCount: doc.pageCount
        },
        signer: {
          id: signer.id,
          name: signer.name,
          email: signer.email,
          color: signer.color
        },
        fields: signerFields
      });
    } catch (error) {
      console.error('Error fetching signing page:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Complete signing
  app.post('/api/sign/:token/complete', async (req, res) => {
    try {
      const { token } = req.params;
      const { fieldValues } = req.body; // { fieldId: value }

      const signer = await storage.getSignerByToken(token);
      if (!signer) {
        res.status(404).json({ success: false, error: 'Invalid signing link' });
        return;
      }

      if (signer.status === 'signed') {
        res.status(400).json({ success: false, error: 'Already signed' });
        return;
      }

      const doc = await storage.getDocumentById(signer.documentId);
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      // Update field values
      for (const [fieldIdStr, value] of Object.entries(fieldValues)) {
        const fieldId = parseInt(fieldIdStr);
        await storage.updateField(fieldId, { value: value as string });
      }

      // Update signer status
      await storage.updateSigner(signer.id, {
        status: 'signed',
        signedAt: new Date()
      });

      await storage.createAuditLog({
        documentId: doc.id,
        signerId: signer.id,
        action: 'signed',
        details: `${signer.name} signed the document`,
        ipAddress: req.ip
      });

      // Check if all signers have signed
      const allSigners = await storage.getSignersByDocumentId(doc.id);
      const allSigned = allSigners.every(s => s.status === 'signed');

      if (allSigned) {
        // Mark document as completed
        await storage.updateDocumentStatus(doc.id, 'completed', new Date());

        await storage.createAuditLog({
          documentId: doc.id,
          action: 'completed',
          details: 'All signers have completed signing',
          ipAddress: req.ip
        });

        // Generate signed PDF and send to all parties
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const downloadLink = `${baseUrl}/api/documents/${doc.id}/download`;
        
        const signerNames = allSigners.map(s => s.name);
        const allEmails = allSigners.map(s => s.email);
        
        // Send completion email to all signers
        for (const s of allSigners) {
          await sendCompletedDocument(
            s.email,
            s.name,
            doc.name,
            signerNames,
            downloadLink
          );
        }
        
        // Auto-create project from signed agreement
        try {
          const borrowerSigner = allSigners[0]; // First signer is typically the borrower
          const projectNumber = await storage.generateProjectNumber();
          const borrowerToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
          
          // Get quote data if linked
          let loanData: Record<string, unknown> = {};
          let quoteProgramId: number | null = null;
          if (doc.quoteId) {
            const quote = await storage.getQuoteById(doc.quoteId, doc.userId!);
            if (quote) {
              loanData = {
                loanAmount: Number(quote.loanAmount),
                interestRate: Number(quote.interestRate),
                loanTermMonths: Number(quote.loanTermMonths) || 12,
                loanType: quote.loanType,
                propertyAddress: quote.propertyAddress,
              };
              quoteProgramId = quote.programId || null;
            }
          }
          
          const project = await storage.createProject({
            userId: doc.userId!,
            projectName: `${borrowerSigner.name} - ${doc.name}`,
            projectNumber,
            loanAmount: loanData.loanAmount as number || null,
            interestRate: loanData.interestRate as number || null,
            loanTermMonths: loanData.loanTermMonths as number || null,
            loanType: loanData.loanType as string || null,
            programId: quoteProgramId,
            propertyAddress: loanData.propertyAddress as string || null,
            borrowerName: borrowerSigner.name,
            borrowerEmail: borrowerSigner.email,
            status: 'active',
            currentStage: 'documentation',
            progressPercentage: 0,
            applicationDate: new Date(),
            targetCloseDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
            borrowerPortalToken: borrowerToken,
            borrowerPortalEnabled: true,
            sourceDocumentId: doc.id,
          });
          
          // Create stages/tasks/documents from program template (or legacy fallback)
          const { buildProjectPipelineFromProgram } = await import('./services/projectPipeline');
          const pipelineResult = await buildProjectPipelineFromProgram(project.id, quoteProgramId, doc.quoteId || undefined);
          console.log(`Pipeline created: ${pipelineResult.stagesCreated} stages, ${pipelineResult.tasksCreated} tasks, ${pipelineResult.documentsCreated} documents (program: ${pipelineResult.usedProgramTemplate ? pipelineResult.programName : 'legacy'})`);
          
          // Log activity
          await storage.createProjectActivity({
            projectId: project.id,
            userId: doc.userId!,
            activityType: 'project_created',
            activityDescription: `Project ${projectNumber} auto-created from signed agreement "${doc.name}"`,
            visibleToBorrower: true,
          });
          
          // Trigger webhook
          const { triggerWebhook } = await import('./utils/webhooks');
          await triggerWebhook(project.id, 'project_created', {
            project_number: projectNumber,
            created_from_agreement: true,
            agreement_id: doc.id,
            agreement_name: doc.name,
          });
          
          console.log(`✓ Project ${projectNumber} auto-created from signed agreement ${doc.id}`);

          // Google Drive folder creation (non-blocking)
          try {
            const { isDriveIntegrationEnabled, ensureProjectFolder } = await import('./services/googleDrive');
            const driveEnabled = await isDriveIntegrationEnabled();
            if (driveEnabled) {
              ensureProjectFolder(project.id).catch((err: any) => {
                console.error(`Drive folder creation failed for deal ${project.id}:`, err.message);
              });
            }
          } catch (driveErr: any) {
            console.error('Drive integration check error:', driveErr.message);
          }
          
        } catch (projectError) {
          console.error('Error creating project from agreement:', projectError);
          // Don't fail the signing just because project creation failed
        }
      }

      res.json({ 
        success: true, 
        completed: allSigned,
        message: allSigned ? 'Document fully signed!' : 'Your signature has been recorded'
      });
    } catch (error) {
      console.error('Error completing signing:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Download signed document
  app.get('/api/documents/:id/download', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const doc = await storage.getDocumentById(documentId, userId);
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const fields = await storage.getFieldsByDocumentId(documentId);
      const signers = await storage.getSignersByDocumentId(documentId);
      const signerMap = new Map(signers.map(s => [s.id, s]));

      // Load the PDF
      const pdfBytes = Buffer.from(doc.fileData.split(',')[1] || doc.fileData, 'base64');
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Add field values to PDF
      for (const field of fields) {
        if (!field.value) continue;
        
        const pageIndex = field.pageNumber - 1;
        if (pageIndex >= pages.length) continue;
        
        const page = pages[pageIndex];
        const { height: pageHeight } = page.getSize();

        if (field.fieldType === 'signature' || field.fieldType === 'initial') {
          // Draw signature image
          try {
            const imgData = field.value.split(',')[1] || field.value;
            const imgBytes = Buffer.from(imgData, 'base64');
            const img = await pdfDoc.embedPng(imgBytes);
            
            page.drawImage(img, {
              x: field.x,
              y: pageHeight - field.y - field.height,
              width: field.width,
              height: field.height
            });
          } catch (imgError) {
            console.error('Error embedding signature image:', imgError);
          }
        } else if (field.fieldType === 'text' || field.fieldType === 'date') {
          // Draw text
          page.drawText(field.value, {
            x: field.x + 5,
            y: pageHeight - field.y - field.height + 10,
            size: 12,
            font,
            color: rgb(0, 0, 0)
          });
        }
      }

      const signedPdfBytes = await pdfDoc.save();
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.name}-signed.pdf"`);
      res.send(Buffer.from(signedPdfBytes));
    } catch (error) {
      console.error('Error downloading document:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get audit log for document
  app.get('/api/documents/:id/audit', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      // Verify user owns this document before returning audit logs
      const doc = await storage.getDocumentById(documentId, userId);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      const logs = await storage.getAuditLogsByDocumentId(documentId);
      res.json({ success: true, logs });
    } catch (error) {
      console.error('Error fetching audit log:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ========== AGREEMENTS API ENDPOINTS (Protected) ==========

  // Get agreements list with signer counts
  app.get('/api/esignature/agreements', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const docs = await storage.getDocuments(req.user!.id);
      
      const agreements = await Promise.all(docs.map(async (doc) => {
        const docSigners = await storage.getSignersByDocumentId(doc.id);
        const signedCount = docSigners.filter(s => s.status === 'signed').length;
        
        return {
          id: doc.id,
          title: doc.name,
          status: doc.status,
          createdAt: doc.createdAt,
          sentAt: doc.sentAt,
          completedAt: doc.completedAt,
          voidedAt: doc.voidedAt,
          quoteId: doc.quoteId,
          totalSigners: docSigners.length,
          signedCount,
          vendor: 'local' as const,
          signers: docSigners.map(s => ({
            id: s.id,
            name: s.name,
            email: s.email,
            status: s.status,
            signedAt: s.signedAt,
            tokenExpiresAt: s.tokenExpiresAt
          }))
        };
      }));
      
      const pandadocEnvelopes = await db.select().from(esignEnvelopes)
        .where(eq(esignEnvelopes.createdBy, req.user!.id))
        .orderBy(desc(esignEnvelopes.createdAt));
      
      const pandadocAgreements = pandadocEnvelopes.map(env => {
        const recipients = (typeof env.recipients === 'string' ? JSON.parse(env.recipients) : env.recipients) as any[] || [];
        const signedCount = recipients.filter((r: any) => r.status === 'signed').length;
        return {
          id: env.id,
          title: env.documentName,
          status: env.status,
          createdAt: env.createdAt,
          sentAt: env.sentAt,
          completedAt: env.completedAt,
          voidedAt: null,
          quoteId: env.quoteId,
          totalSigners: recipients.length,
          signedCount,
          vendor: 'pandadoc' as const,
          externalDocumentId: env.externalDocumentId,
          editorUrl: env.signingUrl,
          signers: recipients.map((r: any, i: number) => ({
            id: i + 1,
            name: r.name || `${r.firstName || ''} ${r.lastName || ''}`.trim(),
            email: r.email,
            status: r.status || 'pending',
            signedAt: r.signedAt,
            tokenExpiresAt: null
          }))
        };
      });
      
      const allAgreements = [...agreements, ...pandadocAgreements]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      res.json({ success: true, agreements: allAgreements });
    } catch (error) {
      console.error('Error fetching agreements:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get single agreement detail with signers and fields
  app.get('/api/esignature/agreements/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const doc = await storage.getDocumentById(documentId, req.user!.id);
      
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Agreement not found' });
      }
      
      const docSigners = await storage.getSignersByDocumentId(documentId);
      const fields = await storage.getFieldsByDocumentId(documentId);
      
      // Create a map of signer IDs to signer info for field display
      const signerMap = new Map(docSigners.map(s => [s.id, s]));
      
      const agreement = {
        id: doc.id,
        title: doc.name,
        fileName: doc.fileName,
        fileData: doc.fileData,
        pageCount: doc.pageCount,
        status: doc.status,
        createdAt: doc.createdAt,
        sentAt: doc.sentAt,
        completedAt: doc.completedAt,
        voidedAt: doc.voidedAt,
        voidedReason: doc.voidedReason,
        signers: docSigners.map(s => ({
          id: s.id,
          name: s.name,
          email: s.email,
          color: s.color,
          status: s.status,
          signedAt: s.signedAt,
          tokenExpiresAt: s.tokenExpiresAt,
          token: s.token
        })),
        fields: fields.map(f => {
          const signer = f.signerId ? signerMap.get(f.signerId) : null;
          return {
            id: f.id,
            fieldType: f.fieldType,
            signerId: f.signerId,
            signerName: signer?.name || null,
            signerColor: signer?.color || '#3B82F6',
            pageNumber: f.pageNumber,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            value: f.value,
            label: f.label,
            signed: f.value !== null
          };
        })
      };
      
      res.json({ success: true, agreement });
    } catch (error) {
      console.error('Error fetching agreement detail:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Void/Cancel document
  app.post('/api/esignature/agreements/:id/void', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const { reason } = req.body;
      
      const doc = await storage.getDocumentById(documentId, req.user!.id);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Agreement not found' });
      }
      
      // Only allow voiding sent or in_progress documents
      if (!['sent', 'in_progress', 'pending'].includes(doc.status)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Can only void documents that are sent or in progress' 
        });
      }
      
      // Update document status
      await storage.updateDocument(documentId, {
        status: 'voided',
        voidedAt: new Date(),
        voidedReason: reason || null
      });
      
      // Disable all signing tokens
      const docSigners = await storage.getSignersByDocumentId(documentId);
      for (const signer of docSigners) {
        await storage.updateSigner(signer.id, { token: null });
        
        // Send void notification to all signers
        try {
          await sendVoidNotification(
            signer.email,
            signer.name,
            doc.name,
            'Lendry.AI',
            reason
          );
        } catch (emailError) {
          console.error('Failed to send void notification to', signer.email, emailError);
        }
      }
      
      // Log action
      await storage.createAuditLog({
        documentId,
        action: 'voided',
        details: reason || 'Document voided by sender'
      });
      
      res.json({ success: true, message: 'Document voided successfully' });
    } catch (error) {
      console.error('Error voiding document:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Edit & Resend - creates a copy of the document
  app.post('/api/esignature/agreements/:id/edit', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const doc = await storage.getDocumentById(documentId, userId);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Agreement not found' });
      }
      
      // Can't edit completed documents
      if (doc.status === 'completed') {
        return res.status(400).json({ 
          success: false, 
          error: 'Cannot edit completed documents' 
        });
      }
      
      // Mark original as voided_edited
      await storage.updateDocument(documentId, {
        status: 'voided_edited',
        voidedAt: new Date(),
        voidedReason: 'Edited and replaced with new version'
      }, userId);
      
      // Disable old tokens
      const oldSigners = await storage.getSignersByDocumentId(documentId);
      for (const signer of oldSigners) {
        await storage.updateSigner(signer.id, { token: null });
      }
      
      // Create new document as copy
      const newDoc = await storage.createDocument({
        quoteId: doc.quoteId,
        name: doc.name.includes('(Revised)') ? doc.name : `${doc.name} (Revised)`,
        fileName: doc.fileName,
        fileData: doc.fileData,
        pageCount: doc.pageCount,
        status: 'draft'
      }, userId);
      
      // Copy signers (new tokens will be generated when sent)
      const signerIdMap = new Map<number, number>();
      for (const oldSigner of oldSigners) {
        const newSigner = await storage.createSigner({
          documentId: newDoc.id,
          name: oldSigner.name,
          email: oldSigner.email,
          color: oldSigner.color,
          signingOrder: oldSigner.signingOrder,
          status: 'pending'
        });
        signerIdMap.set(oldSigner.id, newSigner.id);
      }
      
      // Copy fields
      const oldFields = await storage.getFieldsByDocumentId(documentId);
      for (const oldField of oldFields) {
        const newSignerId = oldField.signerId ? signerIdMap.get(oldField.signerId) : null;
        await storage.createField({
          documentId: newDoc.id,
          signerId: newSignerId,
          pageNumber: oldField.pageNumber,
          fieldType: oldField.fieldType,
          x: oldField.x,
          y: oldField.y,
          width: oldField.width,
          height: oldField.height,
          required: oldField.required,
          label: oldField.label,
          value: null // Reset values for new version
        });
      }
      
      // Log action
      await storage.createAuditLog({
        documentId,
        action: 'voided_edited',
        details: `Document edited and replaced with new version (ID: ${newDoc.id})`
      });
      
      await storage.createAuditLog({
        documentId: newDoc.id,
        action: 'created',
        details: `Created as revision of document ID: ${documentId}`
      });
      
      res.json({ 
        success: true, 
        newDocumentId: newDoc.id,
        message: 'Document copied. You can now edit and resend it.'
      });
    } catch (error) {
      console.error('Error editing document:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Resend to all pending signers (via PandaDoc)
  app.post('/api/esignature/agreements/:id/resend-all', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      
      const doc = await storage.getDocumentById(documentId, req.user!.id);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Agreement not found' });
      }
      
      if (!['sent', 'in_progress', 'pending'].includes(doc.status)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Can only resend documents that are sent or in progress' 
        });
      }

      if (!doc.pandadocDocumentId) {
        return res.status(400).json({
          success: false,
          error: 'Document must be sent via PandaDoc first. Use the PandaDoc send flow to send this document.'
        });
      }

      const sendResult = await pandadoc.sendDocument(doc.pandadocDocumentId, {
        subject: `Reminder: Please sign ${doc.name}`,
        message: 'This is a reminder to review and sign the attached document.',
        silent: false,
      });

      await storage.createAuditLog({
        documentId,
        action: 'resent_all',
        details: `Resent via PandaDoc (ID: ${doc.pandadocDocumentId})`
      });
      
      res.json({ 
        success: true, 
        message: 'Document resent via PandaDoc to all pending signers' 
      });
    } catch (error) {
      console.error('Error resending via PandaDoc:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Resend to individual signer (via PandaDoc - resends entire document)
  app.post('/api/esignature/agreements/:id/resend-signer/:signerId', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const signerId = parseInt(req.params.signerId);
      
      const doc = await storage.getDocumentById(documentId, req.user!.id);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Agreement not found' });
      }
      
      const signer = await storage.getSignerById(signerId);
      if (!signer || signer.documentId !== documentId) {
        return res.status(404).json({ success: false, error: 'Signer not found' });
      }
      
      if (signer.status === 'signed') {
        return res.status(400).json({ 
          success: false, 
          error: 'Signer has already signed' 
        });
      }

      if (!doc.pandadocDocumentId) {
        return res.status(400).json({
          success: false,
          error: 'Document must be sent via PandaDoc first. Use the PandaDoc send flow.'
        });
      }

      const sendResult = await pandadoc.sendDocument(doc.pandadocDocumentId, {
        subject: `Reminder: Please sign ${doc.name}`,
        message: `This is a reminder for ${signer.name} to review and sign the attached document.`,
        silent: false,
      });

      await storage.updateSigner(signer.id, { 
        lastReminderSent: new Date(),
      });
      
      await storage.createAuditLog({
        documentId,
        signerId: signer.id,
        action: 'resent',
        details: `Resent via PandaDoc to ${signer.name} (${signer.email})`
      });
      
      res.json({ 
        success: true, 
        message: `Signing request resent via PandaDoc for ${signer.name}` 
      });
    } catch (error) {
      console.error('Error resending via PandaDoc:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Send reminder to all pending signers (via PandaDoc)
  app.post('/api/esignature/agreements/:id/remind', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      
      const doc = await storage.getDocumentById(documentId, req.user!.id);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Agreement not found' });
      }
      
      if (!['sent', 'in_progress', 'pending'].includes(doc.status)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Can only send reminders for documents that are sent or in progress' 
        });
      }

      if (!doc.pandadocDocumentId) {
        return res.status(400).json({
          success: false,
          error: 'Document must be sent via PandaDoc first. Use the PandaDoc send flow.'
        });
      }

      const sendResult = await pandadoc.sendDocument(doc.pandadocDocumentId, {
        subject: `Reminder: Please sign ${doc.name}`,
        message: 'This is a friendly reminder to review and sign the attached document.',
        silent: false,
      });

      await storage.createAuditLog({
        documentId,
        action: 'reminder_sent',
        details: `Reminder sent via PandaDoc (ID: ${doc.pandadocDocumentId})`
      });
      
      res.json({ 
        success: true, 
        message: 'Reminder sent via PandaDoc to all pending signers' 
      });
    } catch (error) {
      console.error('Error sending PandaDoc reminder:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete draft document
  app.delete('/api/esignature/agreements/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      const doc = await storage.getDocumentById(documentId, userId);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Agreement not found' });
      }
      
      // Only allow deleting draft documents
      if (doc.status !== 'draft') {
        return res.status(403).json({ 
          success: false, 
          error: 'Only draft documents can be deleted' 
        });
      }
      
      // Delete document (cascades to signers, fields, audit log)
      await storage.deleteDocument(documentId, userId);
      
      res.json({ success: true, message: 'Draft deleted successfully' });
    } catch (error) {
      console.error('Error deleting draft:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ==================== COMMISSIONS ROUTE ====================

  app.get('/api/commissions', authenticateUser, requireOnboarding, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;

      const rows = await db
        .select({
          projectId: projects.id,
          projectName: projects.projectName,
          projectNumber: projects.projectNumber,
          status: projects.status,
          currentStage: projects.currentStage,
          loanAmount: projects.loanAmount,
          loanType: projects.loanType,
          propertyAddress: projects.propertyAddress,
          borrowerName: projects.borrowerName,
          createdAt: projects.createdAt,
          fundingDate: projects.fundingDate,
          commission: savedQuotes.commission,
          pointsCharged: savedQuotes.pointsCharged,
          pointsAmount: savedQuotes.pointsAmount,
          tpoPremiumAmount: savedQuotes.tpoPremiumAmount,
          totalRevenue: savedQuotes.totalRevenue,
          interestRate: savedQuotes.interestRate,
        })
        .from(projects)
        .leftJoin(savedQuotes, eq(projects.quoteId, savedQuotes.id))
        .where(and(eq(projects.userId, userId), eq(projects.status, 'active')))
        .orderBy(projects.createdAt);

      res.json({ commissions: rows });
    } catch (error) {
      console.error('Get commissions error:', error);
      res.status(500).json({ error: 'Failed to get commissions' });
    }
  });

  // ==================== PROJECTS ROUTES ====================

  // Get all projects
  app.get('/api/projects', authenticateUser, requireOnboarding, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { status, archived } = req.query;
      
      const projectsList = await storage.getProjects(
        userId,
        status as string | undefined,
        archived !== undefined ? archived === 'true' : undefined
      );

      // Batch-fetch task stats for all projects to avoid N+1
      const projectIds = projectsList.map(p => p.id);
      const taskStatsMap = new Map<number, { completed: number; total: number }>();
      if (projectIds.length > 0) {
        const allTasks = await db.select({
          projectId: projectTasks.projectId,
          status: projectTasks.status,
        }).from(projectTasks).where(inArray(projectTasks.projectId, projectIds));

        for (const task of allTasks) {
          const existing = taskStatsMap.get(task.projectId) || { completed: 0, total: 0 };
          existing.total++;
          if (task.status === 'completed') existing.completed++;
          taskStatsMap.set(task.projectId, existing);
        }
      }

      const projectsWithStats = projectsList.map(project => ({
        ...project,
        completedTasks: taskStatsMap.get(project.id)?.completed || 0,
        totalTasks: taskStatsMap.get(project.id)?.total || 0,
      }));

      res.json({ projects: projectsWithStats });
    } catch (error) {
      console.error('Get projects error:', error);
      res.status(500).json({ error: 'Failed to get projects' });
    }
  });

  // Create new project manually
  app.post('/api/projects', authenticateUser, requireOnboarding, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const {
        projectName: reqProjectName,
        loanAmount,
        interestRate,
        loanTermMonths,
        loanType,
        programId: reqProgramId,
        propertyAddress,
        propertyType,
        borrowerName,
        borrowerEmail,
        borrowerPhone,
        targetCloseDate,
        notes
      } = req.body;
      
      if (!borrowerName || !borrowerEmail) {
        return res.status(400).json({ error: 'Borrower name and email are required' });
      }

      let projectName = reqProjectName;
      if (!projectName) {
        const randomNum = Math.floor(100 + Math.random() * 900);
        if (propertyAddress && typeof propertyAddress === 'string') {
          const addressParts = propertyAddress.trim().split(/[,\n]/)[0].trim();
          const words = addressParts.split(/\s+/);
          const streetNum = words[0] || '';
          const streetName = words.slice(1, 4).join(' ') || '';
          projectName = streetNum && streetName 
            ? `${streetNum} ${streetName} - ${randomNum}` 
            : `Deal - ${randomNum}`;
        } else {
          projectName = `Deal - ${randomNum}`;
        }
      }
      
      const projectNumber = await storage.generateProjectNumber();
      const borrowerToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
      
      const project = await storage.createProject({
        userId,
        projectName,
        projectNumber,
        loanAmount: loanAmount ? parseFloat(loanAmount) : null,
        interestRate: interestRate ? parseFloat(interestRate) : null,
        loanTermMonths: loanTermMonths ? parseInt(loanTermMonths) : null,
        loanType,
        programId: reqProgramId ? parseInt(reqProgramId) : null,
        propertyAddress,
        propertyType,
        borrowerName,
        borrowerEmail,
        borrowerPhone,
        status: 'active',
        currentStage: 'documentation',
        progressPercentage: 0,
        applicationDate: new Date(),
        targetCloseDate: targetCloseDate ? new Date(targetCloseDate) : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        borrowerPortalToken: borrowerToken,
        borrowerPortalEnabled: true,
        notes,
      });
      
      if (propertyAddress) {
        await db.insert(dealProperties).values({
          dealId: project.id,
          address: propertyAddress,
          propertyType: propertyType || null,
          isPrimary: true,
          sortOrder: 0,
        });
      }

      // Create stages/tasks/documents from program template (or legacy fallback)
      const { buildProjectPipelineFromProgram } = await import('./services/projectPipeline');
      const pipelineResult = await buildProjectPipelineFromProgram(project.id, reqProgramId ? parseInt(reqProgramId) : null);
      console.log(`Pipeline created: ${pipelineResult.stagesCreated} stages, ${pipelineResult.tasksCreated} tasks, ${pipelineResult.documentsCreated} documents (program: ${pipelineResult.usedProgramTemplate ? pipelineResult.programName : 'legacy'})`);
      
      // Log activity
      await storage.createProjectActivity({
        projectId: project.id,
        userId,
        activityType: 'project_created',
        activityDescription: `Project ${projectNumber} created manually`,
        visibleToBorrower: true,
      });
      
      // Trigger webhook
      const { triggerWebhook } = await import('./utils/webhooks');
      await triggerWebhook(project.id, 'project_created', {
        project_number: projectNumber,
        created_manually: true,
      });

      // Google Drive folder creation (non-blocking)
      try {
        const { isDriveIntegrationEnabled, ensureProjectFolder } = await import('./services/googleDrive');
        const driveEnabled = await isDriveIntegrationEnabled();
        if (driveEnabled) {
          ensureProjectFolder(project.id).catch((err: any) => {
            console.error(`Drive folder creation failed for deal ${project.id}:`, err.message);
          });
        }
      } catch (driveErr: any) {
        console.error('Drive integration check error:', driveErr.message);
      }
      
      res.status(201).json({ project });
    } catch (error) {
      console.error('Create project error:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  // Get single project with details
  app.get('/api/projects/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);
      
      const project = await storage.getProjectById(projectId, userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      let programName: string | null = null;
      if (project.programId) {
        const [program] = await db.select({ name: loanPrograms.name }).from(loanPrograms).where(eq(loanPrograms.id, project.programId));
        if (program) programName = program.name;
      }
      
      const stages = await storage.getStagesByProjectId(projectId);
      const tasks = await storage.getTasksByProjectId(projectId);
      const activity = await storage.getActivityByProjectId(projectId);
      const documents = await storage.getDocumentsByProjectId(projectId);

      const processors = await db.select({
        id: dealProcessors.id,
        userId: dealProcessors.userId,
        role: dealProcessors.role,
        assignedAt: dealProcessors.assignedAt,
        user: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
        }
      }).from(dealProcessors)
        .innerJoin(users, eq(dealProcessors.userId, users.id))
        .where(eq(dealProcessors.projectId, projectId));
      
      // Group tasks by stage
      const stagesWithTasks = stages.map(stage => ({
        ...stage,
        tasks: tasks.filter(t => t.stageId === stage.id),
      }));
      
      res.json({
        project: { ...project, programName },
        stages: stagesWithTasks,
        activity,
        documents,
        processors,
      });
    } catch (error) {
      console.error('Get project error:', error);
      res.status(500).json({ error: 'Failed to get project' });
    }
  });

  // Update project
  app.put('/api/projects/:id', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);
      
      const existingProject = await storage.getProjectById(projectId, userId);
      if (!existingProject) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const allowedFields = [
        'projectName', 'status', 'loanAmount', 'interestRate', 'loanTermMonths',
        'loanType', 'propertyAddress', 'propertyType', 'borrowerName',
        'borrowerEmail', 'borrowerPhone', 'targetCloseDate', 'notes', 'internalNotes'
      ];
      
      const updates: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }
      
      const updated = await storage.updateProject(projectId, userId, updates);
      
      // Log activity
      await storage.createProjectActivity({
        projectId,
        userId,
        activityType: 'project_updated',
        activityDescription: 'Project details updated',
        visibleToBorrower: false,
      });
      
      // Log for digest if status changed
      if (updates.status && updates.status !== existingProject.status) {
        await logLoanUpdate(
          projectId,
          'status_change',
          `Loan status updated to: ${updates.status}`,
          userId
        );
      }
      
      res.json({ project: updated });
    } catch (error) {
      console.error('Update project error:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  // Update task status
  app.patch('/api/projects/:projectId/tasks/:taskId', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.projectId);
      const taskId = parseInt(req.params.taskId);
      const { status, completedBy, documentUrl } = req.body;
      
      const project = await storage.getProjectById(projectId, userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const task = await storage.getTaskById(taskId);
      if (!task || task.projectId !== projectId) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      const updates: Record<string, unknown> = {};
      if (status) updates.status = status;
      if (completedBy) updates.completedBy = completedBy;
      if (documentUrl) updates.documentUrl = documentUrl;
      if (status === 'completed') updates.completedAt = new Date();
      
      const updatedTask = await storage.updateTask(taskId, updates);
      
      // Log activity
      await storage.createProjectActivity({
        projectId,
        userId,
        activityType: 'task_updated',
        activityDescription: `Task "${task.taskTitle}" marked as ${status}`,
        visibleToBorrower: task.visibleToBorrower ?? false,
      });
      
      // Update progress
      await updateProjectProgress(projectId, userId);
      
      // Trigger webhook for completed tasks
      if (status === 'completed') {
        const { triggerWebhook } = await import('./utils/webhooks');
        await triggerWebhook(projectId, 'task_completed', {
          task_id: task.id,
          task_title: task.taskTitle,
          task_type: task.taskType,
        });
        
        // Log for digest
        await logLoanUpdate(
          projectId,
          'task_completed',
          `Task completed: ${task.taskTitle}`,
          userId
        );
      }
      
      res.json({ task: updatedTask });
    } catch (error) {
      console.error('Update task error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  // Helper function to update progress
  async function updateProjectProgress(projectId: number, userId: number) {
    const stats = await storage.getProjectTaskStats(projectId);
    const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    
    await storage.updateProject(projectId, userId, { progressPercentage: percentage });
    
    // Check if current stage is complete
    const stages = await storage.getStagesByProjectId(projectId);
    const currentStage = stages.find(s => s.status === 'in_progress');
    
    if (currentStage) {
      const stageTasks = await storage.getTasksByStageId(currentStage.id);
      const completedStageTasks = stageTasks.filter(t => t.status === 'completed').length;
      
      if (completedStageTasks === stageTasks.length && stageTasks.length > 0) {
        // Mark stage complete
        await storage.updateStage(currentStage.id, { 
          status: 'completed', 
          completedAt: new Date() 
        });
        
        // Find and activate next stage
        const nextStage = stages.find(s => s.stageOrder === currentStage.stageOrder + 1);
        if (nextStage) {
          await storage.updateStage(nextStage.id, { 
            status: 'in_progress', 
            startedAt: new Date() 
          });
          
          await storage.updateProject(projectId, userId, { 
            currentStage: nextStage.stageKey 
          });
          
          // Log activity
          await storage.createProjectActivity({
            projectId,
            userId,
            activityType: 'stage_completed',
            activityDescription: `Completed "${currentStage.stageName}" stage. Moving to "${nextStage.stageName}"`,
            visibleToBorrower: true,
          });
          
          // Trigger webhook
          const { triggerWebhook } = await import('./utils/webhooks');
          await triggerWebhook(projectId, 'stage_completed', {
            completed_stage: currentStage.stageKey,
            next_stage: nextStage.stageKey,
          });
          
          // Log for digest
          await logLoanUpdate(
            projectId,
            'stage_change',
            `Stage completed: ${currentStage.stageName}. Now in: ${nextStage.stageName}`,
            userId
          );
        }
      }
    }
  }

  // Get borrower portal link
  app.get('/api/projects/:id/borrower-link', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);
      
      const project = await storage.getProjectById(projectId, userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      if (!project.borrowerPortalEnabled) {
        return res.status(403).json({ error: 'Borrower portal is disabled for this project' });
      }
      
      const baseUrl = process.env.BASE_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      const borrowerLink = `${baseUrl}/portal/${project.borrowerPortalToken}`;
      
      res.json({ borrowerLink });
    } catch (error) {
      console.error('Get borrower link error:', error);
      res.status(500).json({ error: 'Failed to get borrower link' });
    }
  });

  // Toggle borrower portal
  app.patch('/api/projects/:id/toggle-portal', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);
      
      const project = await storage.getProjectById(projectId, userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const updated = await storage.updateProject(projectId, userId, {
        borrowerPortalEnabled: !project.borrowerPortalEnabled,
      });
      
      res.json({ borrowerPortalEnabled: updated?.borrowerPortalEnabled });
    } catch (error) {
      console.error('Toggle portal error:', error);
      res.status(500).json({ error: 'Failed to toggle portal' });
    }
  });

  // Project document upload - get presigned URL or direct upload
  app.post('/api/projects/:id/documents/upload-url', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);
      const { name, size, contentType, documentType, documentCategory } = req.body;

      const project = await storage.getProjectById(projectId, userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (!name) {
        return res.status(400).json({ error: 'File name is required' });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const isLocal = uploadURL.startsWith('__local__:');
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL: isLocal ? `/api/projects/${projectId}/documents/upload-direct` : uploadURL,
        objectPath,
        useDirectUpload: isLocal,
        metadata: { name, size, contentType, documentType, documentCategory },
      });
    } catch (error) {
      console.error('Project doc upload URL error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  // Project document direct upload (local storage fallback)
  const projectMulterUpload = multer({ dest: path.join(process.cwd(), 'uploads', 'temp') });
  app.post('/api/projects/:id/documents/upload-direct', authenticateUser, projectMulterUpload.single('file'), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }
      const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const objectId = randomUUID();
      const destPath = path.join(uploadsDir, objectId);
      fs.renameSync(req.file.path, destPath);
      const metaPath = destPath + '.meta';
      fs.writeFileSync(metaPath, JSON.stringify({
        fileName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
      }));
      const objectPath = `/objects/uploads/${objectId}`;
      res.json({
        objectPath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (error) {
      console.error('Direct upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // Project document upload - complete (save record + trigger Drive sync)
  app.post('/api/projects/:id/documents/upload-complete', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);
      const { objectPath, fileName, fileSize, mimeType, documentType, documentCategory } = req.body;

      const project = await storage.getProjectById(projectId, userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (!objectPath || objectPath.includes('..')) {
        return res.status(400).json({ error: 'Object path is required' });
      }

      const doc = await storage.createProjectDocument({
        projectId,
        documentName: fileName || 'Untitled',
        documentType: documentType || null,
        documentCategory: documentCategory || 'borrower_submitted',
        filePath: objectPath,
        fileSize: fileSize || null,
        uploadedBy: userId,
        status: 'pending_review',
        visibleToBorrower: true,
      });

      await storage.createProjectActivity({
        projectId,
        userId,
        activityType: 'document_uploaded',
        activityDescription: `Document uploaded: ${fileName || 'New document'}`,
        visibleToBorrower: true,
      });

      try {
        await db.insert(dealMemoryEntries).values({
          dealId: projectId,
          entryType: 'document_received',
          title: `${fileName || 'Document'} uploaded`,
          description: documentCategory ? `Category: ${documentCategory}` : undefined,
          sourceType: 'user',
          sourceUserId: userId,
          metadata: { documentId: doc.id, category: documentCategory },
        });
      } catch (e) { console.error('Memory entry error:', e); }

      const uploaderInfo = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
      const uploaderName = uploaderInfo[0] ? `${uploaderInfo[0].firstName || ''} ${uploaderInfo[0].lastName || ''}`.trim() || 'A borrower' : 'A borrower';
      const projForLabel = await db.select({ loanNumber: projects.loanNumber }).from(projects).where(eq(projects.id, projectId)).limit(1);
      const dealLabel = projForLabel[0]?.loanNumber || `DEAL-${projectId}`;
      notifyDealAdmins(
        projectId,
        'document_uploaded',
        'New Document Uploaded',
        `${uploaderName} uploaded "${fileName || 'a document'}" to ${dealLabel}`,
        userId
      ).catch(err => console.error('Notification error:', err));

      // Google Drive sync (non-blocking)
      try {
        const { isDriveIntegrationEnabled, syncDocumentToDrive } = await import('./services/googleDrive');
        const driveEnabled = await isDriveIntegrationEnabled();
        if (driveEnabled) {
          syncDocumentToDrive(doc.id).catch((err: any) => {
            console.error(`Drive sync failed for doc ${doc.id}:`, err.message);
          });
        }
      } catch (driveErr: any) {
        console.error('Drive sync check error:', driveErr.message);
      }

      maybeAutoTriggerPipeline(projectId, userId);

      res.json({ document: doc });
    } catch (error) {
      console.error('Project doc upload complete error:', error);
      res.status(500).json({ error: 'Failed to save document' });
    }
  });

  // Get project documents
  app.get('/api/projects/:id/documents', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);

      const project = await storage.getProjectById(projectId, userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const documents = await storage.getDocumentsByProjectId(projectId);
      res.json({ documents });
    } catch (error) {
      console.error('Get project documents error:', error);
      res.status(500).json({ error: 'Failed to load documents' });
    }
  });

  // Get deal documents for a project (borrower accessible)
  app.get('/api/projects/:id/deal-documents', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);

      const project = await storage.getProjectById(projectId, userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const docs = await db.select().from(dealDocuments)
        .where(eq(dealDocuments.dealId, projectId))
        .orderBy(asc(dealDocuments.sortOrder));

      res.json(docs);
    } catch (error) {
      console.error('Get deal documents error:', error);
      res.status(500).json({ error: 'Failed to load documents' });
    }
  });

  // Mark deal document upload complete (broker accessible)
  app.post('/api/projects/:id/deal-documents/:docId/upload-complete', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);
      const docId = parseInt(req.params.docId);

      const project = await storage.getProjectById(projectId, userId);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { objectPath, fileName, fileSize, mimeType } = req.body;

      if (!objectPath || objectPath.includes('..')) return res.status(400).json({ error: 'Object path is required' });

      const existingFiles = await db.select().from(dealDocumentFiles)
        .where(eq(dealDocumentFiles.documentId, docId));
      const nextSortOrder = existingFiles.length;

      const [newFile] = await db.insert(dealDocumentFiles).values({
        documentId: docId,
        filePath: objectPath,
        fileName: fileName || null,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        uploadedAt: new Date(),
        uploadedBy: userId,
        sortOrder: nextSortOrder,
      }).returning();

      const [updated] = await db.update(dealDocuments)
        .set({
          filePath: objectPath,
          fileName: fileName,
          fileSize: fileSize,
          mimeType: mimeType,
          status: 'uploaded',
          uploadedAt: new Date(),
          uploadedBy: userId,
        })
        .where(and(eq(dealDocuments.id, docId), eq(dealDocuments.dealId, projectId)))
        .returning();

      await db.insert(projectActivity).values({
        projectId,
        userId,
        activityType: 'document_uploaded',
        activityDescription: `Broker uploaded: ${updated?.documentName || fileName || 'Document'}`,
        visibleToBorrower: true,
      });

      try {
        await db.insert(dealMemoryEntries).values({
          dealId: projectId,
          entryType: 'document_received',
          title: `${updated?.documentName || fileName || 'Document'} uploaded`,
          description: updated?.documentCategory ? `Category: ${updated.documentCategory}` : undefined,
          sourceType: 'user',
          sourceUserId: userId,
          metadata: { documentId: docId, category: updated?.documentCategory },
        });
      } catch (e) { console.error('Memory entry error:', e); }

      const brokerInfo = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
      const brokerName = brokerInfo[0] ? `${brokerInfo[0].firstName || ''} ${brokerInfo[0].lastName || ''}`.trim() || 'A broker' : 'A broker';
      const projForBrokerLabel = await db.select({ loanNumber: projects.loanNumber }).from(projects).where(eq(projects.id, projectId)).limit(1);
      const brokerDealLabel = projForBrokerLabel[0]?.loanNumber || `DEAL-${projectId}`;
      notifyDealAdmins(
        projectId,
        'document_uploaded',
        'New Document Uploaded',
        `${brokerName} uploaded "${updated?.documentName || fileName || 'a document'}" to ${brokerDealLabel}`,
        userId
      ).catch(err => console.error('Notification error:', err));

      try {
        const { isDriveIntegrationEnabled, syncDealDocumentToDrive } = await import('./services/googleDrive');
        const driveEnabled = await isDriveIntegrationEnabled();
        if (driveEnabled && updated && newFile) {
          syncDealDocumentToDrive(updated.id, newFile.id).catch((err: any) => {
            console.error(`Drive sync failed for broker doc ${updated.id}:`, err.message);
          });
        }
      } catch (driveErr: any) {
        console.error('Drive sync check error:', driveErr.message);
      }

      maybeAutoTriggerPipeline(projectId, userId);

      res.json({ document: updated, file: newFile });
    } catch (error) {
      console.error('Deal doc upload error:', error);
      res.status(500).json({ error: 'Failed to complete upload' });
    }
  });

  // Retry Drive folder sync for a project
  app.post('/api/projects/:id/drive/retry', authenticateUser, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { ensureProjectFolder } = await import('./services/googleDrive');
      const result = await ensureProjectFolder(projectId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Drive folder retry error:', error);
      res.status(500).json({ error: error.message || 'Failed to create Drive folder' });
    }
  });

  // Retry Drive upload for a document
  app.post('/api/documents/:id/drive/retry', authenticateUser, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const { syncDocumentToDrive } = await import('./services/googleDrive');
      await syncDocumentToDrive(documentId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Drive doc retry error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload to Drive' });
    }
  });

  app.post('/api/admin/deals/:dealId/documents/:docId/drive/retry', authenticateUser, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const docId = parseInt(req.params.docId);
      const { syncDealDocumentToDrive } = await import('./services/googleDrive');
      await syncDealDocumentToDrive(docId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Drive deal doc retry error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload to Drive' });
    }
  });

  app.post('/api/admin/deals/:id/drive/push', authenticateUser, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid deal ID' });
      }

      const { isDriveIntegrationEnabled, ensureProjectFolder, ensureDealFolder } = await import('./services/googleDrive');
      const driveEnabled = await isDriveIntegrationEnabled();
      if (!driveEnabled) {
        return res.status(400).json({ error: 'Google Drive integration is not configured. Please set the parent folder ID in Admin Settings.' });
      }

      const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      if (project) {
        const result = await ensureProjectFolder(id);
        return res.json({
          success: true,
          googleDriveFolderId: result.googleDriveFolderId,
          googleDriveFolderUrl: result.googleDriveFolderUrl,
        });
      }

      const [deal] = await db.select().from(savedQuotes).where(eq(savedQuotes.id, id)).limit(1);
      if (deal) {
        const result = await ensureDealFolder(id);
        return res.json({
          success: true,
          googleDriveFolderId: result.googleDriveFolderId,
          googleDriveFolderUrl: result.googleDriveFolderUrl,
        });
      }

      return res.status(404).json({ error: 'Deal not found' });
    } catch (error: any) {
      console.error(`Drive push failed for deal ${req.params.id}:`, error.message);
      res.status(500).json({ error: error.message || 'Failed to create Google Drive folder' });
    }
  });

  // Sync all deal documents to Google Drive
  app.post('/api/admin/deals/:dealId/sync-all-drive', authenticateUser, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const dealId = parseInt(req.params.dealId);
      if (isNaN(dealId)) {
        return res.status(400).json({ error: 'Invalid deal ID' });
      }

      const { isDriveIntegrationEnabled, ensureProjectFolder, ensureDealFolder, syncDealDocumentToDrive } = await import('./services/googleDrive');
      const driveEnabled = await isDriveIntegrationEnabled();
      if (!driveEnabled) {
        return res.status(400).json({ error: 'Google Drive integration is not configured.' });
      }

      const [project] = await db.select().from(projects).where(eq(projects.id, dealId)).limit(1);
      if (project) {
        await ensureProjectFolder(dealId);
      } else {
        await ensureDealFolder(dealId);
      }

      const docs = await db.select()
        .from(dealDocuments)
        .where(and(
          eq(dealDocuments.dealId, dealId),
          eq(dealDocuments.status, 'approved')
        ));

      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (const doc of docs) {
        if (doc.filePath && !doc.googleDriveFileId) {
          try {
            await syncDealDocumentToDrive(doc.id);
            synced++;
          } catch (err: any) {
            console.error(`[Drive Sync All] Error syncing doc ${doc.id}:`, err.message);
            errors++;
          }
        } else if (doc.filePath && doc.googleDriveFileId) {
          skipped++;
        }
      }

      if (docs.length > 0) {
        const docIds = docs.map(d => d.id);
        const files = await db.select()
          .from(dealDocumentFiles)
          .where(inArray(dealDocumentFiles.documentId, docIds));

        for (const file of files) {
          if (file.filePath && !file.googleDriveFileId) {
            try {
              await syncDealDocumentToDrive(file.documentId, file.id);
              synced++;
            } catch (err: any) {
              console.error(`[Drive Sync All] Error syncing file ${file.id}:`, err.message);
              errors++;
            }
          } else if (file.filePath && file.googleDriveFileId) {
            skipped++;
          }
        }
      }

      console.log(`[Drive Sync All] Deal ${dealId}: synced=${synced}, skipped=${skipped}, errors=${errors}`);
      res.json({ success: true, synced, skipped, errors });
    } catch (error: any) {
      console.error(`[Drive Sync All] Failed for deal ${req.params.dealId}:`, error.message);
      res.status(500).json({ error: error.message || 'Failed to sync documents to Drive' });
    }
  });

  // Get Drive integration status
  app.get('/api/admin/drive/status', authenticateUser, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { isDriveIntegrationEnabled, getParentFolderId } = await import('./services/googleDrive');
      const enabled = await isDriveIntegrationEnabled();
      const parentFolderId = await getParentFolderId();
      res.json({ enabled, parentFolderId });
    } catch (error: any) {
      console.error('Drive status error:', error);
      res.status(500).json({ error: 'Failed to check Drive status' });
    }
  });

  // Manual webhook trigger
  app.post('/api/projects/:id/trigger-webhook', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);
      const { eventType, data } = req.body;
      
      const project = await storage.getProjectById(projectId, userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const { triggerWebhook } = await import('./utils/webhooks');
      await triggerWebhook(projectId, eventType || 'manual_trigger', data || {});
      
      res.json({ success: true, message: 'Webhook triggered' });
    } catch (error) {
      console.error('Manual webhook trigger error:', error);
      res.status(500).json({ error: 'Failed to trigger webhook' });
    }
  });

  // Push to external LOS
  app.post('/api/projects/:id/push-to-los', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);
      
      const project = await storage.getProjectById(projectId, userId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const { triggerWebhook } = await import('./utils/webhooks');
      await triggerWebhook(projectId, 'push_to_los', {
        initiated_manually: true,
        project_data: {
          project_number: project.projectNumber,
          loan_amount: project.loanAmount,
          borrower_name: project.borrowerName,
          borrower_email: project.borrowerEmail,
          property_address: project.propertyAddress,
        },
      });
      
      await storage.updateProject(projectId, userId, {
        externalSyncStatus: 'pending',
        externalSyncAt: new Date(),
      });
      
      await storage.createProjectActivity({
        projectId,
        userId,
        activityType: 'los_sync',
        activityDescription: 'Project data pushed to external Loan Origination System',
        visibleToBorrower: false,
      });
      
      res.json({ success: true, message: 'Project pushed to external LOS' });
    } catch (error) {
      console.error('Push to LOS error:', error);
      res.status(500).json({ error: 'Failed to push to LOS' });
    }
  });

  // ==================== BORROWER PORTAL (PUBLIC) ====================

  // Get borrower portal view (no auth required)
  // ==================== BORROWER PORTAL ROUTES ====================
  registerPortalRoutes(app, { storage, db, authenticateUser, requireAdmin, requireOnboarding, requirePermission, objectStorageService });

  // ==================== MESSAGING ROUTES ====================
  registerMessagingRoutes(app, { storage, db, authenticateUser, requireAdmin, requireOnboarding, requirePermission, objectStorageService });

  // ==================== AI ASSISTANT ROUTES ====================
  registerAiAssistantRoutes(app);

  // ==================== PROCESSOR ROUTES ====================
  registerProcessorRoutes(app);


  // ==================== BROKER SDR ROUTES ====================
  registerBrokerSdrRoutes(app);

  // ==================== AI AGENT SYSTEM ROUTES ====================
  registerAgentRoutes(app, { storage, db, authenticateUser, requireAdmin, requireOnboarding, requirePermission, objectStorageService });

  // ==================== EMAIL INTEGRATION ROUTES ====================
  registerEmailRoutes(app, { storage, db, authenticateUser, requireAdmin, requireOnboarding, requirePermission, objectStorageService });


  // ==================== ADMIN ROUTES ====================

  // Register admin programs routes
  registerAdminProgramsRoutes(app, { storage, db, authenticateUser, requireAdmin, requireOnboarding, requirePermission, objectStorageService });

  // Note: Old messaging routes code has been moved to routes/messaging.ts

  // Get single thread with messages
  app.get('/api/messages/threads/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const threadId = parseInt(req.params.id);
      const userId = req.user!.id;
      const role = req.user!.role;

      const thread = await db.select().from(messageThreads)
        .where(eq(messageThreads.id, threadId)).limit(1);

      if (!thread[0]) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      // Auth check: user can only view own threads
      if (!isAdminRole(role) && thread[0].userId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const threadMessages = await db.select().from(messages)
        .where(eq(messages.threadId, threadId))
        .orderBy(messages.createdAt)
        .limit(500);

      // Get sender names for messages
      const messagesWithSenders = await Promise.all(threadMessages.map(async (msg) => {
        if (msg.senderId) {
          const sender = await db.select({ fullName: users.fullName, email: users.email })
            .from(users).where(eq(users.id, msg.senderId)).limit(1);
          return { ...msg, senderName: sender[0]?.fullName || sender[0]?.email || 'Unknown' };
        }
        return { ...msg, senderName: 'System' };
      }));

      res.json({ thread: thread[0], messages: messagesWithSenders });
    } catch (error) {
      console.error('Get thread error:', error);
      res.status(500).json({ error: 'Failed to get thread' });
    }
  });

  // Create or get thread (by dealId + userId)
  app.post('/api/messages/threads', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { dealId, userId: targetUserId, subject = null } = req.body;
      const requesterRole = req.user!.role;
      const requesterId = req.user!.id;

      if (!dealId) {
        return res.status(400).json({ error: 'dealId is required' });
      }

      if (!targetUserId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      // Users can only create threads for themselves, admins can create for anyone
      if (!isAdminRole(requesterRole) && parseInt(targetUserId) !== requesterId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Check if thread already exists for this user + deal combination
      const existing = await db.select().from(messageThreads)
        .where(and(
          eq(messageThreads.userId, parseInt(targetUserId)),
          eq(messageThreads.dealId, parseInt(dealId))
        )).limit(1);

      if (existing[0]) {
        return res.json({ thread: existing[0] });
      }

      // Create new thread
      const newThread = await db.insert(messageThreads).values({
        dealId: parseInt(dealId),
        userId: parseInt(targetUserId),
        createdBy: requesterId,
        subject: subject
      }).returning();

      // Initialize read receipt for the target user
      await db.insert(messageReads).values({
        threadId: newThread[0].id,
        userId: parseInt(targetUserId),
        lastReadAt: new Date('1970-01-01')
      }).onConflictDoNothing();

      res.json({ thread: newThread[0] });
    } catch (error) {
      console.error('Create thread error:', error);
      res.status(500).json({ error: 'Failed to create thread' });
    }
  });

  // Send message/notification
  app.post('/api/messages/threads/:id/messages', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const threadId = parseInt(req.params.id);
      const { body, type = 'message', meta = null } = req.body;
      const userId = req.user!.id;
      const role = req.user!.role;

      if (!body || typeof body !== 'string') {
        return res.status(400).json({ error: 'body is required' });
      }

      if (!['message', 'notification'].includes(type)) {
        return res.status(400).json({ error: 'invalid type' });
      }

      const thread = await db.select().from(messageThreads)
        .where(eq(messageThreads.id, threadId)).limit(1);

      if (!thread[0]) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      // Auth check: user can only post to own thread
      if (!isAdminRole(role) && thread[0].userId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const senderRole = isAdminRole(role) ? 'admin' : 'user';

      const newMessage = await db.insert(messages).values({
        threadId,
        senderId: userId,
        senderRole,
        type,
        body,
        meta
      }).returning();

      // Update thread's lastMessageAt
      await db.update(messageThreads)
        .set({ lastMessageAt: new Date() })
        .where(eq(messageThreads.id, threadId));

      // Notification trigger: notify the other party about the new message
      try {
        const senderInfo = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
        const senderName = senderInfo[0] ? `${senderInfo[0].firstName || ''} ${senderInfo[0].lastName || ''}`.trim() || 'Someone' : 'Someone';
        const preview = body.length > 80 ? body.substring(0, 80) + '...' : body;
        const dealId = thread[0].dealId;
        const msgProj = await db.select({ loanNumber: projects.loanNumber }).from(projects).where(eq(projects.id, dealId)).limit(1);
        const msgDealLabel = msgProj[0]?.loanNumber || `DEAL-${dealId}`;

        if (senderRole === 'user') {
          notifyDealAdmins(
            dealId,
            'new_message',
            'New Message Received',
            `${senderName} sent a message on ${msgDealLabel}: "${preview}"`,
            userId
          ).catch(err => console.error('Message notification error:', err));
        } else {
          if (thread[0].userId !== userId) {
            createNotification({
              userId: thread[0].userId,
              type: 'new_message',
              title: 'New Message From Your Lender',
              message: `You have a new message on ${msgDealLabel}: "${preview}"`,
              dealId,
              link: `/messages`,
            }).catch(err => console.error('Message notification error:', err));
          }
        }
      } catch (notifErr) {
        console.error('Message notification error:', notifErr);
      }

      res.json({ message: newMessage[0] });
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Mark thread as read
  app.post('/api/messages/threads/:id/read', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const threadId = parseInt(req.params.id);
      const userId = req.user!.id;
      const role = req.user!.role;

      const thread = await db.select().from(messageThreads)
        .where(eq(messageThreads.id, threadId)).limit(1);

      if (!thread[0]) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      if (!isAdminRole(role) && thread[0].userId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Upsert read receipt
      const existing = await db.select().from(messageReads)
        .where(and(
          eq(messageReads.threadId, threadId),
          eq(messageReads.userId, userId)
        )).limit(1);

      if (existing[0]) {
        await db.update(messageReads)
          .set({ lastReadAt: new Date() })
          .where(and(
            eq(messageReads.threadId, threadId),
            eq(messageReads.userId, userId)
          ));
      } else {
        await db.insert(messageReads).values({
          threadId,
          userId,
          lastReadAt: new Date()
        });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Mark read error:', error);
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  // Get unread count for badge
  app.get('/api/messages/unread-count', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;

      let unreadCount = 0;

      if (isAdminRole(role)) {
        // Admin unread = messages from users after admin's last_read_at
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM messages m
          JOIN message_threads t ON t.id = m.thread_id
          LEFT JOIN message_reads r ON r.thread_id = t.id AND r.user_id = ${userId}
          WHERE m.sender_role = 'user'
            AND m.created_at > COALESCE(r.last_read_at, '1970-01-01')
        `);
        unreadCount = (result.rows[0] as any)?.count || 0;
      } else {
        // User unread = messages from admins/system after user's last_read_at
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM messages m
          JOIN message_threads t ON t.id = m.thread_id
          LEFT JOIN message_reads r ON r.thread_id = t.id AND r.user_id = ${userId}
          WHERE t.user_id = ${userId}
            AND m.sender_role IN ('admin', 'system')
            AND m.created_at > COALESCE(r.last_read_at, '1970-01-01')
        `);
        unreadCount = (result.rows[0] as any)?.count || 0;
      }

      res.json({ unreadCount });
    } catch (error) {
      console.error('Unread count error:', error);
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  });

  // ==================== NOTIFICATION HELPER ====================
  
  // Internal helper to post a notification to a user's thread (creates thread if needed)
  async function postDealNotification(userId: number, dealId: number, message: string, meta?: any) {
    try {
      // Find or create thread for this user + deal
      let thread = await db.select().from(messageThreads)
        .where(and(
          eq(messageThreads.userId, userId),
          eq(messageThreads.dealId, dealId)
        )).limit(1);
      
      if (!thread[0]) {
        // Create thread for this deal
        const newThread = await db.insert(messageThreads).values({
          dealId,
          userId,
          createdBy: null, // System created
          subject: `Deal #${dealId} Updates`
        }).returning();
        thread = newThread;
        
        // Initialize read receipt
        await db.insert(messageReads).values({
          threadId: newThread[0].id,
          userId,
          lastReadAt: new Date('1970-01-01')
        }).onConflictDoNothing();
      }
      
      // Post notification message
      await db.insert(messages).values({
        threadId: thread[0].id,
        senderId: null,
        senderRole: 'system',
        type: 'notification',
        body: message,
        meta
      });
      
      // Update thread's lastMessageAt
      await db.update(messageThreads)
        .set({ lastMessageAt: new Date() })
        .where(eq(messageThreads.id, thread[0].id));
        
      return thread[0];
    } catch (error) {
      console.error('Failed to post deal notification:', error);
      return null;
    }
  }
  
  // API endpoint for posting notifications (admin only)
  app.post('/api/messages/notify', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { userId, dealId, message, meta } = req.body;
      
      if (!userId || !message) {
        return res.status(400).json({ error: 'userId and message are required' });
      }
      
      const thread = await postDealNotification(userId, dealId || null, message, meta);
      
      if (!thread) {
        return res.status(500).json({ error: 'Failed to send notification' });
      }
      
      res.json({ success: true, threadId: thread.id });
    } catch (error) {
      console.error('Notify error:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  // ==================== ADMIN ROUTES ====================

  // Admin Dashboard Stats
  app.get('/api/admin/dashboard', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const stats = await storage.getAdminDashboardStats();
      const recentActivity = await storage.getRecentAdminActivity(10);
      
      res.json({ stats, recentActivity });
    } catch (error) {
      console.error('Admin dashboard error:', error);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  });

  // Admin Task Board - Get tasks with project context
  // Admins and super_admins see all tasks; staff/processors only see tasks assigned to them
  app.get('/api/admin/task-board', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const date = req.query.date as string | undefined;
      const status = req.query.status as string | undefined;

      const user = await storage.getUserById(req.user!.id);
      const isFullAccess = user && ['admin', 'super_admin'].includes(user.role);
      const filterUserId = isFullAccess ? undefined : req.user!.id;

      const tasks = await storage.getTaskBoardTasks({ date, status, userId: filterUserId });
      
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      let dateCounts: Record<string, number> = {};
      if (startDate && endDate) {
        dateCounts = await storage.getTaskBoardDateCounts(startDate, endDate, filterUserId);
      }

      const pendingCount = await storage.getPendingProjectTasksCount(filterUserId);
      
      res.json({ tasks, dateCounts, pendingCount });
    } catch (error) {
      console.error('Task board error:', error);
      res.status(500).json({ error: 'Failed to load task board' });
    }
  });

  // Admin Task Board - Update a project task (complete, edit, reschedule)
  app.patch('/api/admin/task-board/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { status, taskTitle, taskDescription, dueDate, priority, assignedTo } = req.body;
      
      const updates: any = {};
      if (status !== undefined) updates.status = status;
      if (taskTitle !== undefined) updates.taskTitle = taskTitle;
      if (taskDescription !== undefined) updates.taskDescription = taskDescription;
      if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
      if (priority !== undefined) updates.priority = priority;
      if (assignedTo !== undefined) updates.assignedTo = assignedTo;
      
      if (status === 'completed') {
        updates.completedAt = new Date();
        updates.completedBy = req.user?.fullName || req.user?.email || 'Admin';
      }
      
      const existingTask = await storage.getTaskById(id);

      const updated = await storage.updateTask(id, updates);
      if (!updated) {
        return res.status(404).json({ error: 'Task not found' });
      }

      if (assignedTo) {
        const assigneeId = parseInt(String(assignedTo));
        const previousId = existingTask?.assignedTo ? parseInt(String(existingTask.assignedTo)) : null;
        if (!isNaN(assigneeId) && assigneeId !== req.user!.id && assigneeId !== previousId) {
          const assignerName = req.user!.fullName || req.user!.email || 'Someone';
          const taskTitle = updated.taskTitle || 'a task';
          const projectId = updated.projectId;
          await createNotification({
            userId: assigneeId,
            type: 'task_assigned',
            title: 'Task Assigned',
            message: `${assignerName} assigned you "${taskTitle}"`,
            dealId: projectId || undefined,
            link: projectId ? `/admin/deals/${projectId}` : undefined,
          });
        }
      }
      
      res.json(updated);
    } catch (error) {
      console.error('Task board update error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  // Admin - List all users
  app.get('/api/admin/users', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const role = req.query.role as string | undefined;
      const search = req.query.search as string | undefined;
      
      const usersList = await storage.getAllUsers({ role, search });
      
      // Remove password hashes
      const safeUsers = usersList.map(u => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        companyName: u.companyName,
        phone: u.phone,
        title: u.title,
        role: u.role,
        roles: u.roles || [u.role],
        userType: u.userType,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        emailVerified: u.emailVerified,
        isActive: u.isActive,
        inviteStatus: u.inviteStatus || 'none',
      }));
      
      res.json({ users: safeUsers });
    } catch (error) {
      console.error('Admin users error:', error);
      res.status(500).json({ error: 'Failed to load users' });
    }
  });

  // Admin - Create user manually
  app.post('/api/admin/users', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { email, password, fullName, companyName, phone, role, roles, title, userType } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }
      
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(password, 10);

      const { getPrimaryRole } = await import('@shared/schema');
      const userRoles: string[] = roles?.length ? roles : (role ? [role] : ['user']);
      const primaryRole = getPrimaryRole(userRoles);
      
      const newUser = await storage.createUser({
        email,
        passwordHash,
        fullName: fullName || null,
        companyName: companyName || null,
        phone: phone || null,
        title: title || null,
        role: primaryRole,
        roles: userRoles,
        userType: userType || 'broker',
        isActive: true,
        emailVerified: true,
      });
      
      res.json({ 
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          companyName: newUser.companyName,
          phone: newUser.phone,
          role: newUser.role,
          roles: newUser.roles,
          createdAt: newUser.createdAt,
          isActive: newUser.isActive,
          emailVerified: newUser.emailVerified,
        }
      });
    } catch (error) {
      console.error('Admin create user error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // Admin - Invite team member via email
  app.post('/api/admin/invite-member', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { firstName, lastName, email, role } = req.body;
      
      if (!firstName || !lastName || !email) {
        return res.status(400).json({ error: 'First name, last name, and email are required' });
      }
      
      const validRoles = ['processor', 'admin'];
      const assignedRole = validRoles.includes(role) ? role : 'processor';
      
      const existingUser = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existingUser) {
        return res.status(400).json({ error: 'A user with this email already exists' });
      }
      
      const inviteToken = generateRandomToken();
      const inviteExpires = new Date(Date.now() + 7 * 24 * 3600000); // 7 days
      
      const { getPrimaryRole } = await import('@shared/schema');
      const userRoles = [assignedRole];
      const primaryRole = getPrimaryRole(userRoles);
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      
      const newUser = await storage.createUser({
        email: email.toLowerCase().trim(),
        passwordHash: null,
        fullName,
        companyName: null,
        phone: null,
        title: null,
        role: primaryRole,
        roles: userRoles,
        userType: 'broker',
        isActive: true,
        emailVerified: false,
        inviteToken,
        inviteTokenExpires: inviteExpires,
        invitedBy: req.user!.id,
        inviteStatus: 'pending',
      });
      
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const inviteLink = `${baseUrl}/accept-invite/${inviteToken}`;
      
      const inviterName = req.user!.fullName || req.user!.email;
      const inviterEmail = req.user!.email;
      
      let companyName = 'Lendry.AI';
      try {
        const brandingSetting = await storage.getSystemSetting('tenant_branding');
        if (brandingSetting?.value) {
          const branding = typeof brandingSetting.value === 'string' ? JSON.parse(brandingSetting.value) : brandingSetting.value;
          if (branding.companyName) companyName = branding.companyName;
        }
      } catch (e) {}
      
      const emailResult = await sendTeamInviteEmail(
        newUser.email,
        fullName,
        inviterName,
        companyName,
        assignedRole,
        inviteLink,
        inviterEmail
      );
      
      res.json({ 
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          role: newUser.role,
          roles: newUser.roles,
          inviteStatus: 'pending',
        },
        emailSent: emailResult.success,
      });
    } catch (error: any) {
      console.error('Admin invite member error:', error);
      res.status(500).json({ error: 'Failed to invite team member' });
    }
  });

  // Public - Accept invite and set password
  app.post('/api/auth/accept-invite', async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ error: 'Token and password are required' });
      }
      
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      const allUsers = await db.select().from(users).where(eq(users.inviteToken, token));
      const user = allUsers[0];
      
      if (!user) {
        return res.status(400).json({ error: 'Invalid invitation link' });
      }
      
      if (user.inviteTokenExpires && new Date() > new Date(user.inviteTokenExpires)) {
        return res.status(400).json({ error: 'This invitation has expired. Please ask your admin to send a new one.' });
      }
      
      const passwordHash = await hashPassword(password);
      
      await storage.updateUser(user.id, {
        passwordHash,
        inviteToken: null,
        inviteTokenExpires: null,
        inviteStatus: 'accepted',
        emailVerified: true,
        onboardingCompleted: true,
      });
      
      res.json({ success: true, message: 'Account setup complete. You can now sign in.' });
    } catch (error) {
      console.error('Accept invite error:', error);
      res.status(500).json({ error: 'Failed to set up account' });
    }
  });

  // Public - Validate invite token
  app.get('/api/auth/validate-invite/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const allUsers = await db.select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        inviteTokenExpires: users.inviteTokenExpires,
        inviteStatus: users.inviteStatus,
      }).from(users).where(eq(users.inviteToken, token));
      const user = allUsers[0];
      
      if (!user) {
        return res.status(400).json({ valid: false, error: 'Invalid invitation link' });
      }
      
      if (user.inviteTokenExpires && new Date() > new Date(user.inviteTokenExpires)) {
        return res.status(400).json({ valid: false, error: 'This invitation has expired' });
      }
      
      if (user.inviteStatus === 'accepted') {
        return res.status(400).json({ valid: false, error: 'This invitation has already been accepted' });
      }
      
      res.json({ valid: true, email: user.email, fullName: user.fullName });
    } catch (error) {
      console.error('Validate invite error:', error);
      res.status(500).json({ valid: false, error: 'Failed to validate invitation' });
    }
  });

  // Admin - Resend invite
  app.post('/api/admin/resend-invite/:userId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const user = await storage.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (user.inviteStatus === 'accepted') {
        return res.status(400).json({ error: 'This user has already accepted their invitation' });
      }
      
      const inviteToken = generateRandomToken();
      const inviteExpires = new Date(Date.now() + 7 * 24 * 3600000);
      
      await storage.updateUser(userId, {
        inviteToken,
        inviteTokenExpires: inviteExpires,
        inviteStatus: 'pending',
      });
      
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const inviteLink = `${baseUrl}/accept-invite/${inviteToken}`;
      const inviterName = req.user!.fullName || req.user!.email;
      const inviterEmail = req.user!.email;
      
      let companyName = 'Lendry.AI';
      try {
        const brandingSetting = await storage.getSystemSetting('tenant_branding');
        if (brandingSetting?.value) {
          const branding = typeof brandingSetting.value === 'string' ? JSON.parse(brandingSetting.value) : brandingSetting.value;
          if (branding.companyName) companyName = branding.companyName;
        }
      } catch (e) {}
      
      const emailResult = await sendTeamInviteEmail(
        user.email,
        user.fullName || 'Team Member',
        inviterName,
        companyName,
        user.role,
        inviteLink,
        inviterEmail
      );
      
      res.json({ success: true, emailSent: emailResult.success });
    } catch (error) {
      console.error('Resend invite error:', error);
      res.status(500).json({ error: 'Failed to resend invitation' });
    }
  });

  // Admin - Update user (role, active status)
  app.patch('/api/admin/users/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { role, roles: rolesInput, isActive, title, fullName, phone, companyName } = req.body;
      
      const { getPrimaryRole } = await import('@shared/schema');
      const updates: Record<string, any> = {};
      
      if (rolesInput !== undefined && Array.isArray(rolesInput)) {
        updates.roles = rolesInput;
        updates.role = getPrimaryRole(rolesInput);
      } else if (role !== undefined && ['user', 'admin', 'staff', 'super_admin', 'processor'].includes(role)) {
        updates.role = role;
        updates.roles = [role];
      }
      if (isActive !== undefined) {
        updates.isActive = isActive;
      }
      if (title !== undefined) {
        updates.title = title || null;
      }
      if (fullName !== undefined) {
        updates.fullName = fullName || null;
      }
      if (phone !== undefined) {
        updates.phone = phone || null;
      }
      if (companyName !== undefined) {
        updates.companyName = companyName || null;
      }
      
      const updated = await storage.updateUser(userId, updates);
      
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      await storage.createAdminActivity({
        userId: req.user!.id,
        actionType: 'user_updated',
        actionDescription: `Updated user ${updated.email}: ${JSON.stringify(updates)}`,
        metadata: { targetUserId: userId, updates }
      });
      
      res.json({ 
        user: {
          id: updated.id,
          email: updated.email,
          fullName: updated.fullName,
          role: updated.role,
          roles: updated.roles,
          isActive: updated.isActive
        }
      });
    } catch (error) {
      console.error('Admin update user error:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  // Admin - Remove team member
  app.delete('/api/admin/users/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.id);

      // Prevent removing yourself
      if (userId === req.user!.id) {
        return res.status(400).json({ error: 'You cannot remove yourself' });
      }

      // Prevent removing super_admin users (only super admins manage super admins)
      const targetUser = await storage.getUserById(userId);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (targetUser.role === 'super_admin') {
        return res.status(403).json({ error: 'Cannot remove a super admin user' });
      }

      const relatedTables = [
        { table: 'user_onboarding_progress', col: 'user_id' },
        { table: 'lender_training_progress', col: 'user_id' },
        { table: 'notifications', col: 'user_id' },
        { table: 'message_reads', col: 'user_id' },
        { table: 'ai_assistant_conversations', col: 'user_id' },
      ];
      for (const { table, col } of relatedTables) {
        await db.execute(sql.raw(`DELETE FROM "${table}" WHERE "${col}" = ${userId}`));
      }

      const nullableTables = [
        { table: 'admin_tasks', col: 'assigned_to' },
        { table: 'admin_tasks', col: 'completed_by' },
        { table: 'deal_documents', col: 'reviewed_by' },
        { table: 'deal_documents', col: 'uploaded_by' },
        { table: 'deal_document_files', col: 'uploaded_by' },
        { table: 'deal_tasks', col: 'assigned_to' },
        { table: 'deal_tasks', col: 'completed_by' },
        { table: 'deal_tasks', col: 'created_by' },
        { table: 'project_documents', col: 'reviewed_by' },
        { table: 'project_documents', col: 'uploaded_by' },
        { table: 'project_activity', col: 'user_id' },
        { table: 'commercial_submissions', col: 'assigned_to' },
        { table: 'deal_memory_entries', col: 'source_user_id' },
        { table: 'deal_processors', col: 'user_id' },
        { table: 'deal_processors', col: 'assigned_by' },
        { table: 'agent_communications', col: 'approved_by' },
        { table: 'agent_pipeline_runs', col: 'triggered_by' },
        { table: 'agent_runs', col: 'triggered_by' },
        { table: 'document_review_results', col: 'reviewed_by' },
        { table: 'email_thread_deal_links', col: 'linked_by' },
        { table: 'esign_envelopes', col: 'created_by' },
        { table: 'loan_digest_configs', col: 'created_by' },
        { table: 'loan_updates', col: 'performed_by' },
        { table: 'scheduled_digest_drafts', col: 'approved_by' },
        { table: 'submission_notes', col: 'admin_user_id' },
        { table: 'rule_proposals', col: 'reviewed_by' },
        { table: 'processor_daily_queue', col: 'approved_by' },
        { table: 'processor_daily_queue', col: 'processor_id' },
      ];
      for (const { table, col } of nullableTables) {
        try {
          await db.execute(sql.raw(`UPDATE "${table}" SET "${col}" = NULL WHERE "${col}" = ${userId}`));
        } catch (_) {}
      }

      const ownedDeleteTables = [
        'saved_quotes',
        'deal_notes',
        'messages',
        'email_accounts',
        'loan_digest_recipients',
        'broker_contacts',
        'broker_outreach_messages',
        'team_permissions',
      ];
      for (const table of ownedDeleteTables) {
        try {
          await db.execute(sql.raw(`DELETE FROM "${table}" WHERE "user_id" = ${userId}`));
        } catch (_) {}
      }

      try {
        await db.execute(sql.raw(`DELETE FROM "message_threads" WHERE "user_id" = ${userId}`));
        await db.execute(sql.raw(`DELETE FROM "message_threads" WHERE "created_by" = ${userId}`));
      } catch (_) {}

      await db.delete(users).where(eq(users.id, userId));

      res.json({ success: true });
    } catch (error) {
      console.error('Admin remove user error:', error);
      res.status(500).json({ error: 'Failed to remove user' });
    }
  });

  // Team Permissions - Get all permissions (super_admin only)
  app.get('/api/admin/permissions', authenticateUser, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.initializeDefaultPermissions();
      const permissions = await storage.getAllPermissions();
      res.json({ permissions });
    } catch (error) {
      console.error('Get permissions error:', error);
      res.status(500).json({ error: 'Failed to load permissions' });
    }
  });

  // Team Permissions - Get permissions for current user
  app.get('/api/permissions/me', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
      const user = await storage.getUserById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const userRoles = user.roles?.length ? user.roles : [user.role];

      if (userRoles.includes('super_admin')) {
        const { PERMISSION_KEYS } = await import('@shared/schema');
        const allPerms: Record<string, boolean> = {};
        for (const key of PERMISSION_KEYS) {
          allPerms[key] = true;
        }
        return res.json({ permissions: allPerms, role: user.role, roles: userRoles });
      }

      if (user.role === 'user' && userRoles.length <= 1) {
        return res.json({ permissions: {}, role: user.role, roles: userRoles });
      }

      await storage.initializeDefaultPermissions();
      const permMap: Record<string, boolean> = {};
      const teamRoles = userRoles.filter(r => r !== 'user');
      for (const role of teamRoles) {
        const perms = await storage.getPermissionsByRole(role);
        for (const p of perms) {
          if (p.enabled) {
            permMap[p.permissionKey] = true;
          } else if (!(p.permissionKey in permMap)) {
            permMap[p.permissionKey] = false;
          }
        }
      }
      res.json({ permissions: permMap, role: user.role, roles: userRoles });
    } catch (error) {
      console.error('Get my permissions error:', error);
      res.status(500).json({ error: 'Failed to load permissions' });
    }
  });

  // Team Permissions - Update permissions for a role (super_admin only)
  app.put('/api/admin/permissions/:role', authenticateUser, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { role } = req.params;
      const { permissions } = req.body;

      if (!['staff', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Can only configure permissions for staff and admin roles' });
      }

      if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: 'Permissions must be an array of { key, enabled }' });
      }

      await storage.bulkUpsertPermissions(role, permissions, req.user!.id);

      await storage.createAdminActivity({
        userId: req.user!.id,
        actionType: 'permissions_updated',
        actionDescription: `Updated permissions for role: ${role}`,
        metadata: { role, permissionCount: permissions.length }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Update permissions error:', error);
      res.status(500).json({ error: 'Failed to update permissions' });
    }
  });

  // Team Permissions - Get all permissions for all roles (admin only)
  app.get('/api/admin/team-permissions', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.initializeDefaultPermissions();
      const allPermissions = await storage.getAllPermissions();

      // Group permissions by role with enabled + scope
      const grouped: Record<string, Record<string, { enabled: boolean; scope: string }>> = {};
      for (const perm of allPermissions) {
        if (!grouped[perm.role]) {
          grouped[perm.role] = {};
        }
        grouped[perm.role][perm.permissionKey] = {
          enabled: perm.enabled,
          scope: perm.scope || 'all',
        };
      }

      res.json(grouped);
    } catch (error) {
      console.error('Get team permissions error:', error);
      res.status(500).json({ error: 'Failed to load permissions' });
    }
  });

  // Team Permissions - Update a single permission (admin only)
  app.put('/api/admin/team-permissions', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { role, permissionKey, enabled, scope } = req.body;

      if (!role || !permissionKey || enabled === undefined) {
        return res.status(400).json({ error: 'Missing role, permissionKey, or enabled field' });
      }

      if (!['processor', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Can only configure permissions for processor and admin roles' });
      }

      await storage.upsertPermission(role, permissionKey, enabled, req.user!.id, scope);

      try {
        await storage.createAdminActivity({
          projectId: 0 as any,
          userId: req.user!.id,
          actionType: 'permissions_updated',
          actionDescription: `Updated permission ${permissionKey} for role: ${role}`,
          metadata: { role, permissionKey, enabled, scope }
        });
      } catch (_) {
        // Permission activity logging may fail if no project context - this is fine
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Update team permission error:', error);
      res.status(500).json({ error: 'Failed to update permission' });
    }
  });

  // Admin - Pipeline grouped by program (for Kanban + pipeline summary views)
  app.get('/api/admin/pipeline', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const allProjects = await storage.getAllProjects({ status: 'active' });

      const projectsWithStages = await Promise.all(allProjects.map(async (p) => {
        const stages = await storage.getStagesByProjectId(p.id);
        let ownerName = 'Unknown';
        let ownerEmail = '';
        if (p.userId) {
          const owner = await storage.getUserById(p.userId);
          if (owner) {
            ownerName = owner.fullName || owner.email;
            ownerEmail = owner.email;
          }
        }
        const currentStageObj = stages.find(s => s.status === 'in_progress') || stages.find(s => s.status === 'pending');
        return {
          ...p,
          ownerName,
          ownerEmail,
          currentStageName: currentStageObj?.stageName || p.currentStage || 'Unknown',
          currentStageKey: currentStageObj?.stageKey || '',
          currentStageId: currentStageObj?.id || null,
          stages,
        };
      }));

      const programIds = [...new Set(allProjects.map(p => p.programId).filter(Boolean))] as number[];

      const programsData = await Promise.all(programIds.map(async (programId) => {
        const steps = await db.select({
          id: programWorkflowSteps.id,
          stepOrder: programWorkflowSteps.stepOrder,
          stepName: workflowStepDefinitions.name,
          stepKey: workflowStepDefinitions.key,
          stepColor: workflowStepDefinitions.color,
        })
        .from(programWorkflowSteps)
        .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
        .where(eq(programWorkflowSteps.programId, programId))
        .orderBy(asc(programWorkflowSteps.stepOrder));

        const program = await db.select().from(loanPrograms).where(eq(loanPrograms.id, programId)).limit(1);

        return {
          programId,
          programName: program[0]?.name || `Program ${programId}`,
          steps,
          projects: projectsWithStages.filter(p => p.programId === programId),
        };
      }));

      const unassigned = projectsWithStages.filter(p => !p.programId);

      res.json({ programs: programsData, unassigned });
    } catch (error) {
      console.error('Admin pipeline error:', error);
      res.status(500).json({ error: 'Failed to load pipeline data' });
    }
  });

  // Admin - Move project to a different stage (for Kanban drag-and-drop)
  app.patch('/api/admin/projects/:id/move-stage', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const { targetStageKey } = req.body;

      if (!targetStageKey) {
        return res.status(400).json({ error: 'targetStageKey is required' });
      }

      const project = await storage.getProjectByIdInternal(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const stages = await storage.getStagesByProjectId(projectId);
      const targetStage = stages.find(s => s.stageKey === targetStageKey);
      if (!targetStage) {
        return res.status(400).json({ error: `Stage '${targetStageKey}' not found for this project` });
      }

      for (const stage of stages) {
        if (stage.stageOrder < targetStage.stageOrder) {
          if (stage.status !== 'completed') {
            await storage.updateStage(stage.id, { status: 'completed', completedAt: new Date() });
          }
        } else if (stage.id === targetStage.id) {
          await storage.updateStage(stage.id, { status: 'in_progress', startedAt: stage.startedAt || new Date() });
        } else {
          if (stage.status !== 'pending' && stage.status !== 'skipped') {
            await storage.updateStage(stage.id, { status: 'pending', startedAt: null, completedAt: null });
          }
        }
      }

      await db.update(projects).set({ currentStage: targetStageKey, lastUpdated: new Date() }).where(eq(projects.id, projectId));

      await storage.createProjectActivity({
        projectId,
        activityType: 'stage_change',
        description: `Project moved to stage: ${targetStage.stageName}`,
        performedBy: req.user!.id,
      });

      try {
        await db.insert(dealMemoryEntries).values({
          dealId: projectId,
          entryType: 'stage_change',
          title: `Moved to stage: ${targetStage.stageName}`,
          sourceType: 'admin',
          sourceUserId: req.user!.id,
          metadata: { stageKey: targetStageKey, stageName: targetStage.stageName },
        });
      } catch (e) { console.error('Memory entry error:', e); }

      res.json({ success: true, currentStage: targetStageKey });
    } catch (error) {
      console.error('Move stage error:', error);
      res.status(500).json({ error: 'Failed to move project stage' });
    }
  });

  // Admin - List all projects
  app.get('/api/admin/projects', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const stage = req.query.stage as string | undefined;
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const projectsList = await storage.getAllProjects({ status, stage, userId });

      // Batch-fetch all unique owner IDs to avoid N+1 queries
      const ownerIds = [...new Set(projectsList.map(p => p.userId).filter((id): id is number => id !== null && id !== undefined))];
      const ownerMap = new Map<number, { fullName: string | null; email: string }>();
      if (ownerIds.length > 0) {
        const owners = await db.select({ id: users.id, fullName: users.fullName, email: users.email })
          .from(users)
          .where(inArray(users.id, ownerIds));
        for (const owner of owners) {
          ownerMap.set(owner.id, { fullName: owner.fullName, email: owner.email });
        }
      }

      const projectsWithOwners = projectsList.map(p => {
        const owner = p.userId ? ownerMap.get(p.userId) : undefined;
        return {
          ...p,
          ownerName: owner?.fullName || owner?.email || 'Unknown',
          ownerEmail: owner?.email || '',
        };
      });

      res.json({ projects: projectsWithOwners.slice(offset, offset + limit), total: projectsWithOwners.length });
    } catch (error) {
      console.error('Admin projects error:', error);
      res.status(500).json({ error: 'Failed to load projects' });
    }
  });

  // Admin - Get single project with admin tasks
  app.get('/api/admin/projects/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Get project without user filter (admin can see all)
      const project = await storage.getProjectByIdInternal(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const stages = await storage.getStagesByProjectId(projectId);
      const tasks = await storage.getTasksByProjectId(projectId);
      const activity = await storage.getActivityByProjectId(projectId);
      const adminTasks = await storage.getAdminTasksByProjectId(projectId);
      const adminActivityList = await storage.getAdminActivityByProjectId(projectId);
      
      // Nest tasks under their stages
      const stagesWithTasks = stages.map(stage => ({
        ...stage,
        tasks: tasks.filter(t => t.stageId === stage.id),
      }));
      
      // Get owner info
      let owner = null;
      if (project.userId) {
        const ownerData = await storage.getUserById(project.userId);
        if (ownerData) {
          owner = { id: ownerData.id, email: ownerData.email, fullName: ownerData.fullName };
        }
      }
      
      const dealDocs = await db.select()
        .from(dealDocuments)
        .where(eq(dealDocuments.dealId, projectId))
        .orderBy(dealDocuments.sortOrder);
      
      const allFiles = await db.select()
        .from(dealDocumentFiles)
        .where(inArray(dealDocumentFiles.documentId, dealDocs.map(d => d.id).length > 0 ? dealDocs.map(d => d.id) : [0]))
        .orderBy(dealDocumentFiles.sortOrder, dealDocumentFiles.createdAt);
      
      const docsWithFiles = dealDocs.map(doc => ({
        ...doc,
        files: allFiles.filter(f => f.documentId === doc.id),
      }));
      
      res.json({ project, stages: stagesWithTasks, tasks, activity, adminTasks, adminActivity: adminActivityList, owner, documents: docsWithFiles });
    } catch (error) {
      console.error('Admin project detail error:', error);
      res.status(500).json({ error: 'Failed to load project' });
    }
  });

  // Admin - Update project fields
  app.patch('/api/admin/projects/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const { targetCloseDate } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: 'Project ID is required' });
      }

      const updateData: Record<string, any> = {};

      if (targetCloseDate !== undefined) {
        updateData.targetCloseDate = targetCloseDate ? new Date(targetCloseDate) : null;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const [updated] = await db.update(projects)
        .set(updateData)
        .where(eq(projects.id, projectId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Project not found' });
      }

      res.json({ project: updated });
    } catch (error) {
      console.error('Admin project update error:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  // Admin - Update deal people (borrower info, broker assignment)
  app.patch('/api/admin/deals/:dealId/people', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const { borrowerName, borrowerEmail, borrowerPhone, brokerId } = req.body;

      const updateData: Record<string, any> = {};

      if (borrowerName !== undefined) updateData.borrowerName = borrowerName;
      if (borrowerEmail !== undefined) updateData.borrowerEmail = borrowerEmail || null;
      if (borrowerPhone !== undefined) updateData.borrowerPhone = borrowerPhone || null;
      if (brokerId !== undefined) updateData.userId = brokerId;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const [updated] = await db.update(projects)
        .set(updateData)
        .where(eq(projects.id, dealId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      let userName: string | null = null;
      let userEmail: string | null = null;
      if (updated.userId) {
        const [broker] = await db.select({ fullName: users.fullName, email: users.email })
          .from(users)
          .where(eq(users.id, updated.userId))
          .limit(1);
        userName = broker?.fullName || null;
        userEmail = broker?.email || null;
      }

      res.json({
        success: true,
        borrowerName: updated.borrowerName,
        borrowerEmail: updated.borrowerEmail,
        borrowerPhone: updated.borrowerPhone,
        brokerId: updated.userId,
        brokerName: userName,
        brokerEmail: userEmail,
      });
    } catch (error) {
      console.error('Admin update deal people error:', error);
      res.status(500).json({ error: 'Failed to update deal people' });
    }
  });

  app.get('/api/admin/deals/:dealId/third-parties', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const contacts = await db.select().from(dealThirdParties)
        .where(eq(dealThirdParties.projectId, dealId))
        .orderBy(asc(dealThirdParties.createdAt));
      res.json({ contacts });
    } catch (error) {
      console.error('Get third parties error:', error);
      res.status(500).json({ error: 'Failed to get third parties' });
    }
  });

  app.post('/api/admin/deals/:dealId/third-parties', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const { name, email, phone, role, company, notes } = req.body;
      if (!name || !role) {
        return res.status(400).json({ error: 'Name and role are required' });
      }
      const [contact] = await db.insert(dealThirdParties).values({
        projectId: dealId,
        name,
        email: email || null,
        phone: phone || null,
        role,
        company: company || null,
        notes: notes || null,
        createdBy: req.user!.id,
      }).returning();
      res.json(contact);
    } catch (error) {
      console.error('Add third party error:', error);
      res.status(500).json({ error: 'Failed to add third party' });
    }
  });

  app.patch('/api/admin/deals/:dealId/third-parties/:contactId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const { name, email, phone, role, company, notes } = req.body;
      const [updated] = await db.update(dealThirdParties)
        .set({ name, email: email || null, phone: phone || null, role, company: company || null, notes: notes || null, updatedAt: new Date() })
        .where(eq(dealThirdParties.id, contactId))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Contact not found' });
      res.json(updated);
    } catch (error) {
      console.error('Update third party error:', error);
      res.status(500).json({ error: 'Failed to update third party' });
    }
  });

  app.delete('/api/admin/deals/:dealId/third-parties/:contactId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const contactId = parseInt(req.params.contactId);
      await db.delete(dealThirdParties).where(eq(dealThirdParties.id, contactId));
      res.json({ success: true });
    } catch (error) {
      console.error('Delete third party error:', error);
      res.status(500).json({ error: 'Failed to delete third party' });
    }
  });

  // Admin - Rebuild project pipeline from linked program
  app.post('/api/admin/projects/:id/rebuild-pipeline', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProjectByIdInternal(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const programId = req.body.programId ? parseInt(req.body.programId) : project.programId;
      if (!programId) {
        return res.status(400).json({ error: 'No program linked to this project. Please select a program first.' });
      }

      if (programId !== project.programId) {
        await db.update(projects)
          .set({ programId })
          .where(eq(projects.id, projectId));
      }

      const { rebuildProjectPipelineFromProgram } = await import('./services/projectPipeline');
      const result = await rebuildProjectPipelineFromProgram(projectId, programId);

      await storage.createProjectActivity({
        projectId,
        userId: req.user!.id,
        activityType: 'pipeline_rebuilt',
        activityDescription: `Pipeline rebuilt from program "${result.programName || 'Unknown'}": ${result.stagesCreated} stages, ${result.tasksCreated} tasks, ${result.documentsCreated} documents`,
        visibleToBorrower: false,
      });

      res.json({ 
        success: true, 
        stagesCreated: result.stagesCreated,
        tasksCreated: result.tasksCreated,
        documentsCreated: result.documentsCreated,
        programName: result.programName,
      });
    } catch (error) {
      console.error('Rebuild pipeline error:', error);
      res.status(500).json({ error: 'Failed to rebuild pipeline' });
    }
  });

  // Admin - Convert deal to a different loan program (preserves uploaded documents)
  app.post('/api/admin/projects/:id/convert-program', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const { programId } = req.body;
      if (!programId) {
        return res.status(400).json({ error: 'programId is required' });
      }

      const newProgramId = parseInt(programId);
      const project = await storage.getProjectByIdInternal(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (project.programId === newProgramId) {
        return res.status(400).json({ error: 'Deal is already assigned to this program' });
      }

      await db.update(projects)
        .set({ programId: newProgramId })
        .where(eq(projects.id, projectId));

      const { convertDealToProgram } = await import('./services/projectPipeline');
      const result = await convertDealToProgram(projectId, newProgramId);

      await storage.createProjectActivity({
        projectId,
        userId: req.user!.id,
        activityType: 'program_converted',
        activityDescription: `Loan program changed to "${result.programName || 'Unknown'}". ${result.documentsPreserved} uploaded documents preserved. ${result.stagesCreated} stages, ${result.tasksCreated} tasks, ${result.documentsCreated} document requirements created.`,
        visibleToBorrower: false,
      });

      res.json({
        success: true,
        stagesCreated: result.stagesCreated,
        tasksCreated: result.tasksCreated,
        documentsCreated: result.documentsCreated,
        documentsPreserved: result.documentsPreserved,
        programName: result.programName,
      });
    } catch (error) {
      console.error('Convert program error:', error);
      res.status(500).json({ error: 'Failed to convert loan program' });
    }
  });

  // Admin - Create admin task for project
  app.post('/api/admin/projects/:id/tasks', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const { taskTitle, taskDescription, taskCategory, priority, dueDate, assignedTo, userMilestoneTaskId, autoUpdateUserTask, requiresDocument } = req.body;
      
      const task = await storage.createAdminTask({
        projectId,
        taskTitle,
        taskDescription,
        taskCategory,
        priority: priority || 'medium',
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedTo,
        userMilestoneTaskId,
        autoUpdateUserTask: autoUpdateUserTask ?? true,
        requiresDocument: requiresDocument ?? false,
        status: 'pending'
      });
      
      await storage.createAdminActivity({
        projectId,
        userId: req.user!.id,
        actionType: 'task_created',
        actionDescription: `Created admin task: ${taskTitle}`,
        metadata: { taskId: task.id }
      });
      
      res.status(201).json({ task });
    } catch (error) {
      console.error('Admin create task error:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  // Admin - Update project task (user milestone task) - allows admin to toggle task completion
  app.patch('/api/admin/projects/:projectId/tasks/:taskId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const taskId = parseInt(req.params.taskId);
      const { status, assignedTo } = req.body;
      
      const task = await storage.getTaskById(taskId);
      if (!task || task.projectId !== projectId) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      const updates: Record<string, unknown> = {};
      if (status) updates.status = status;
      if (status === 'completed') {
        updates.completedAt = new Date();
        updates.completedBy = req.user!.fullName || req.user!.email;
      }
      if (status === 'pending') {
        updates.completedAt = null;
        updates.completedBy = null;
      }
      if (assignedTo !== undefined) {
        updates.assignedTo = assignedTo || null;
      }
      
      const updatedTask = await storage.updateTask(taskId, updates);
      
      let activityDesc = '';
      if (status) {
        activityDesc = `Task "${task.taskTitle}" marked as ${status}`;
      }
      if (assignedTo !== undefined) {
        if (assignedTo) {
          const assignee = await storage.getUserById(parseInt(assignedTo));
          const assigneeName = assignee?.fullName || assignee?.email || 'someone';
          activityDesc = activityDesc ? `${activityDesc}, assigned to ${assigneeName}` : `Task "${task.taskTitle}" assigned to ${assigneeName}`;

          const assigneeId = parseInt(String(assignedTo));
          const previousId = task.assignedTo ? parseInt(String(task.assignedTo)) : null;
          if (!isNaN(assigneeId) && assigneeId !== req.user!.id && assigneeId !== previousId) {
            const assignerName = req.user!.fullName || req.user!.email || 'Someone';
            await createNotification({
              userId: assigneeId,
              type: 'task_assigned',
              title: 'Task Assigned',
              message: `${assignerName} assigned you "${task.taskTitle}"`,
              dealId: projectId,
              link: `/admin/deals/${projectId}`,
            });
          }
        } else {
          activityDesc = activityDesc ? `${activityDesc}, unassigned` : `Task "${task.taskTitle}" unassigned`;
        }
      }
      if (!activityDesc) activityDesc = `Task "${task.taskTitle}" updated`;

      await storage.createProjectActivity({
        projectId,
        userId: req.user!.id,
        activityType: 'task_updated',
        activityDescription: activityDesc,
        visibleToBorrower: task.visibleToBorrower ?? false,
      });
      
      await updateProjectProgress(projectId, req.user!.id);
      
      if (status === 'completed') {
        const { triggerWebhook } = await import('./utils/webhooks');
        await triggerWebhook(projectId, 'task_completed', {
          task_id: task.id,
          task_title: task.taskTitle,
          task_type: task.taskType,
        });
        
        await logLoanUpdate(
          projectId,
          'task_completed',
          `Task completed: ${task.taskTitle}`,
          req.user!.id
        );
      }
      
      res.json({ task: updatedTask });
    } catch (error) {
      console.error('Admin update project task error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  // Admin - Create one-off project task within a specific stage
  app.post('/api/admin/projects/:projectId/stages/:stageId/tasks', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const stageId = parseInt(req.params.stageId);
      const { taskTitle, taskDescription, priority, assignedTo } = req.body;

      if (!taskTitle || !taskTitle.trim()) {
        return res.status(400).json({ error: 'Task title is required' });
      }

      const stage = await storage.getStageById(stageId);
      if (!stage || stage.projectId !== projectId) {
        return res.status(404).json({ error: 'Stage not found for this project' });
      }

      const task = await storage.createProjectTask({
        projectId,
        stageId,
        taskTitle: taskTitle.trim(),
        taskDescription: taskDescription?.trim() || null,
        priority: priority || 'medium',
        status: 'pending',
        ...(assignedTo ? { assignedTo } : {}),
      });

      await storage.createProjectActivity({
        projectId,
        userId: req.user!.id,
        activityType: 'task_added',
        activityDescription: `Task "${taskTitle.trim()}" added to stage "${stage.stageName}"`,
        visibleToBorrower: false,
      });

      res.json({ task });
    } catch (error) {
      console.error('Admin create stage task error:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  // Admin - Update admin task
  app.patch('/api/admin/tasks/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const { status, internalNotes, assignedTo, priority } = req.body;
      
      const updates: any = {};
      if (status) updates.status = status;
      if (internalNotes !== undefined) updates.internalNotes = internalNotes;
      if (assignedTo !== undefined) updates.assignedTo = assignedTo;
      if (priority) updates.priority = priority;
      
      if (status === 'completed') {
        updates.completedAt = new Date();
        updates.completedBy = req.user!.id;
      }
      
      const task = await storage.updateAdminTask(taskId, updates);
      
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      // If task completed and linked to user milestone, update that too
      if (status === 'completed' && task.autoUpdateUserTask && task.userMilestoneTaskId) {
        await storage.updateProjectTask(task.userMilestoneTaskId, { status: 'completed', completedAt: new Date() });
        
        // Log activity
        await storage.createAdminActivity({
          projectId: task.projectId,
          userId: req.user!.id,
          actionType: 'milestone_synced',
          actionDescription: `Synced user milestone task after admin task completion`,
          metadata: { adminTaskId: taskId, userTaskId: task.userMilestoneTaskId }
        });
      }
      
      await storage.createAdminActivity({
        projectId: task.projectId,
        userId: req.user!.id,
        actionType: 'task_updated',
        actionDescription: `Updated admin task: ${task.taskTitle} - ${JSON.stringify(updates)}`,
        metadata: { taskId, updates }
      });
      
      res.json({ task });
    } catch (error) {
      console.error('Admin update task error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  // Admin - List all agreements/documents
  app.get('/api/admin/agreements', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      
      const documentsList = await storage.getAllDocuments({ status, userId });
      
      // Get owner info
      const docsWithOwners = await Promise.all(documentsList.map(async (d) => {
        let ownerName = 'Unknown';
        let ownerEmail = '';
        if (d.userId) {
          const owner = await storage.getUserById(d.userId);
          if (owner) {
            ownerName = owner.fullName || owner.email;
            ownerEmail = owner.email;
          }
        }
        return { ...d, ownerName, ownerEmail };
      }));
      
      res.json({ agreements: docsWithOwners });
    } catch (error) {
      console.error('Admin agreements error:', error);
      res.status(500).json({ error: 'Failed to load agreements' });
    }
  });

  // Admin - System settings
  app.get('/api/admin/settings', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.getAllSettings();
      res.json({ settings });
    } catch (error) {
      console.error('Admin settings error:', error);
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  // Admin - Update system setting
  app.put('/api/admin/settings/:key', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { key } = req.params;
      const { value, description } = req.body;

      if ((key === 'pandadoc_api_key' || key === 'openai_api_key') && req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admins can manage API keys' });
      }
      
      if (!value) {
        return res.status(400).json({ error: 'Value is required' });
      }
      
      const setting = await storage.upsertSetting(key, value, description || null, req.user!.id);
      
      await storage.createAdminActivity({
        userId: req.user!.id,
        actionType: 'setting_updated',
        actionDescription: `Updated setting: ${key}`,
        metadata: { key, value }
      });
      
      res.json({ setting });
    } catch (error) {
      console.error('Admin update setting error:', error);
      res.status(500).json({ error: 'Failed to update setting' });
    }
  });

  app.delete('/api/admin/settings/:key', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { key } = req.params;
      await storage.deleteSetting(key);
      res.json({ success: true });
    } catch (error) {
      console.error('Admin delete setting error:', error);
      res.status(500).json({ error: 'Failed to delete setting' });
    }
  });

  // Admin - Deal Stages endpoints
  app.get('/api/admin/deal-stages', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      // Seed default stages if none exist
      await storage.seedDefaultDealStages();
      const stages = await storage.getAllDealStages();
      res.json({ stages });
    } catch (error) {
      console.error('Admin get deal stages error:', error);
      res.status(500).json({ error: 'Failed to load deal stages' });
    }
  });

  app.post('/api/admin/deal-stages', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { key, label, color, description } = req.body;
      
      if (!key || !label || !color) {
        return res.status(400).json({ error: 'Key, label, and color are required' });
      }

      // Check for duplicate key
      const existing = await storage.getDealStageByKey(key);
      if (existing) {
        return res.status(400).json({ error: 'A stage with this key already exists' });
      }

      // Get max sortOrder
      const allStages = await storage.getAllDealStages();
      const maxOrder = allStages.length > 0 ? Math.max(...allStages.map(s => s.sortOrder)) : -1;

      const stage = await storage.createDealStage({
        key,
        label,
        color,
        description: description || null,
        sortOrder: maxOrder + 1,
        isActive: true
      });

      await storage.createAdminActivity({
        userId: req.user!.id,
        actionType: 'stage_created',
        actionDescription: `Created deal stage: ${label}`,
        metadata: { stageId: stage.id, key, label }
      });

      res.json({ stage });
    } catch (error) {
      console.error('Admin create deal stage error:', error);
      res.status(500).json({ error: 'Failed to create deal stage' });
    }
  });

  // IMPORTANT: Reorder route must come BEFORE :id route to avoid "reorder" being parsed as an id
  app.put('/api/admin/deal-stages/reorder', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { stageOrders } = req.body;
      
      if (!Array.isArray(stageOrders)) {
        return res.status(400).json({ error: 'stageOrders array is required' });
      }

      await storage.updateDealStagesOrder(stageOrders);

      await storage.createAdminActivity({
        userId: req.user!.id,
        actionType: 'stages_reordered',
        actionDescription: 'Reordered deal stages',
        metadata: { stageOrders }
      });

      const stages = await storage.getAllDealStages();
      res.json({ stages });
    } catch (error) {
      console.error('Admin reorder deal stages error:', error);
      res.status(500).json({ error: 'Failed to reorder deal stages' });
    }
  });

  app.put('/api/admin/deal-stages/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { label, color, description, isActive } = req.body;

      const stage = await storage.updateDealStage(id, { label, color, description, isActive });
      
      if (!stage) {
        return res.status(404).json({ error: 'Stage not found' });
      }

      await storage.createAdminActivity({
        userId: req.user!.id,
        actionType: 'stage_updated',
        actionDescription: `Updated deal stage: ${stage.label}`,
        metadata: { stageId: id }
      });

      res.json({ stage });
    } catch (error) {
      console.error('Admin update deal stage error:', error);
      res.status(500).json({ error: 'Failed to update deal stage' });
    }
  });

  app.delete('/api/admin/deal-stages/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      await storage.deleteDealStage(id);

      await storage.createAdminActivity({
        userId: req.user!.id,
        actionType: 'stage_deleted',
        actionDescription: `Deleted deal stage`,
        metadata: { stageId: id }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Admin delete deal stage error:', error);
      res.status(500).json({ error: 'Failed to delete deal stage' });
    }
  });

  // Admin - Check integration statuses
  app.get('/api/admin/integrations/status', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const integrations: Record<string, { connected: boolean; status: string; details?: any }> = {};
      
      // Check Twilio integration
      try {
        const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
        const xReplitToken = process.env.REPL_IDENTITY 
          ? 'repl ' + process.env.REPL_IDENTITY 
          : process.env.WEB_REPL_RENEWAL 
          ? 'depl ' + process.env.WEB_REPL_RENEWAL 
          : null;
        
        if (hostname && xReplitToken) {
          const twilioResponse = await fetch(
            `https://${hostname}/api/v2/connection?include_secrets=false&connector_names=twilio`,
            {
              headers: {
                'Accept': 'application/json',
                'X_REPLIT_TOKEN': xReplitToken
              }
            }
          );
          const twilioData = await twilioResponse.json();
          const twilioConnection = twilioData.items?.[0];
          
          if (twilioConnection && twilioConnection.settings?.account_sid) {
            integrations.twilio = {
              connected: true,
              status: 'Connected',
              details: {
                phoneNumber: twilioConnection.settings?.phone_number || 'Not configured'
              }
            };
          } else {
            integrations.twilio = { connected: false, status: 'Not connected' };
          }
        } else {
          integrations.twilio = { connected: false, status: 'Connector not available' };
        }
      } catch (error) {
        integrations.twilio = { connected: false, status: 'Error checking status' };
      }
      
      // Check Resend integration
      try {
        const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
        const xReplitToken = process.env.REPL_IDENTITY 
          ? 'repl ' + process.env.REPL_IDENTITY 
          : process.env.WEB_REPL_RENEWAL 
          ? 'depl ' + process.env.WEB_REPL_RENEWAL 
          : null;
        
        if (hostname && xReplitToken) {
          const resendResponse = await fetch(
            `https://${hostname}/api/v2/connection?include_secrets=false&connector_names=resend`,
            {
              headers: {
                'Accept': 'application/json',
                'X_REPLIT_TOKEN': xReplitToken
              }
            }
          );
          const resendData = await resendResponse.json();
          const resendConnection = resendData.items?.[0];
          
          if (resendConnection && resendConnection.settings) {
            integrations.resend = {
              connected: true,
              status: 'Connected',
              details: {
                fromEmail: resendConnection.settings?.from_email || 'Default'
              }
            };
          } else {
            integrations.resend = { connected: false, status: 'Not connected' };
          }
        } else {
          integrations.resend = { connected: false, status: 'Connector not available' };
        }
      } catch (error) {
        integrations.resend = { connected: false, status: 'Error checking status' };
      }
      
      // Check Apify integration (environment variable based)
      integrations.apify = {
        connected: !!process.env.APIFY_TOKEN,
        status: process.env.APIFY_TOKEN ? 'Connected' : 'Not configured',
        details: process.env.APIFY_TOKEN ? { configured: true } : undefined
      };
      
      // Check OpenAI integration
      try {
        const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
        const xReplitToken = process.env.REPL_IDENTITY 
          ? 'repl ' + process.env.REPL_IDENTITY 
          : process.env.WEB_REPL_RENEWAL 
          ? 'depl ' + process.env.WEB_REPL_RENEWAL 
          : null;
        
        if (hostname && xReplitToken) {
          const openaiResponse = await fetch(
            `https://${hostname}/api/v2/connection?include_secrets=false&connector_names=openai`,
            {
              headers: {
                'Accept': 'application/json',
                'X_REPLIT_TOKEN': xReplitToken
              }
            }
          );
          const openaiData = await openaiResponse.json();
          const openaiConnection = openaiData.items?.[0];
          
          if (openaiConnection) {
            integrations.openai = { connected: true, status: 'Connected' };
          } else if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
            integrations.openai = { connected: true, status: 'Connected' };
          } else {
            integrations.openai = { connected: false, status: 'Not connected' };
          }
        } else if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
          integrations.openai = { connected: true, status: 'Connected' };
        } else {
          integrations.openai = { connected: false, status: 'Connector not available' };
        }
      } catch (error) {
        if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
          integrations.openai = { connected: true, status: 'Connected' };
        } else {
          integrations.openai = { connected: false, status: 'Error checking status' };
        }
      }
      
      // Check Geoapify integration (environment variable based)
      integrations.geoapify = {
        connected: !!process.env.GEOAPIFY_API_KEY,
        status: process.env.GEOAPIFY_API_KEY ? 'Connected' : 'Not configured',
        details: process.env.GEOAPIFY_API_KEY ? { configured: true } : undefined
      };

      // Check PandaDoc integration (env var or system setting)
      let pandadocKey = process.env.PANDADOC_API_KEY;
      if (!pandadocKey) {
        try {
          const setting = await storage.getSettingByKey('pandadoc_api_key');
          pandadocKey = setting?.settingValue || '';
        } catch {}
      }
      integrations.pandadoc = {
        connected: !!pandadocKey,
        status: pandadocKey ? 'Connected' : 'Not configured',
        details: pandadocKey ? { configured: true } : undefined
      };
      
      res.json({ integrations });
    } catch (error) {
      console.error('Error checking integration statuses:', error);
      res.status(500).json({ error: 'Failed to check integration statuses' });
    }
  });

  // Admin - Recent activity log
  app.get('/api/admin/activity', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const activity = await storage.getRecentAdminActivity(limit);
      res.json({ activity });
    } catch (error) {
      console.error('Admin activity error:', error);
      res.status(500).json({ error: 'Failed to load activity' });
    }
  });

  // Admin - Deals dashboard with all quotes across users
  app.get('/api/admin/deals', authenticateUser, requireAdmin, requirePermission('pipeline.view'), async (req: AuthRequest, res: Response) => {
    try {
      const { search, status } = req.query;
      
      // Get all projects (loans) across all users
      const allProjects = await db.select({
        id: projects.id,
        userId: projects.userId,
        projectNumber: projects.projectNumber,
        loanNumber: projects.loanNumber,
        projectName: projects.projectName,
        borrowerName: projects.borrowerName,
        borrowerEmail: projects.borrowerEmail,
        borrowerPhone: projects.borrowerPhone,
        propertyAddress: projects.propertyAddress,
        propertyType: projects.propertyType,
        loanAmount: projects.loanAmount,
        interestRate: projects.interestRate,
        loanTermMonths: projects.loanTermMonths,
        loanType: projects.loanType,
        status: projects.status,
        currentStage: projects.currentStage,
        progressPercentage: projects.progressPercentage,
        createdAt: projects.createdAt,
        targetCloseDate: projects.targetCloseDate,
        quoteId: projects.quoteId,
        programId: projects.programId,
        googleDriveFolderId: projects.googleDriveFolderId,
        googleDriveFolderUrl: projects.googleDriveFolderUrl,
        driveSyncStatus: projects.driveSyncStatus,
        userName: users.fullName,
        userEmail: users.email,
      })
        .from(projects)
        .leftJoin(users, eq(projects.userId, users.id))
        .where(eq(projects.isArchived, false))
        .orderBy(desc(projects.createdAt));
      
      // Pre-load project current workflow step keys for all projects
      const allProjectStagesForDeals = await db.select({
        projectId: projectStages.projectId,
        stageKey: projectStages.stageKey,
        status: projectStages.status,
        programStepId: projectStages.programStepId,
      }).from(projectStages);

      const allProgramStepMappingsForDeals = await db.select({
        programStepId: programWorkflowSteps.id,
        stepKey: workflowStepDefinitions.key,
      })
        .from(programWorkflowSteps)
        .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id));
      const stepIdToKeyForDeals = new Map(allProgramStepMappingsForDeals.map(m => [m.programStepId, m.stepKey]));

      const projectToStepKey = new Map<number, string>();
      for (const p of allProjects) {
        const stages = allProjectStagesForDeals.filter(s => s.projectId === p.id);
        const inProgress = stages.find(s => s.status === 'in_progress');
        if (inProgress) {
          if (inProgress.programStepId && stepIdToKeyForDeals.has(inProgress.programStepId)) {
            projectToStepKey.set(p.id, stepIdToKeyForDeals.get(inProgress.programStepId)!);
          } else {
            projectToStepKey.set(p.id, inProgress.stageKey);
          }
        }
      }

      // Transform projects to deal format for frontend compatibility
      const deals = allProjects.map(p => {
        const nameParts = (p.borrowerName || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        return {
          id: p.id,
          projectId: p.id,
          projectNumber: p.projectNumber,
          userId: p.userId,
          customerFirstName: firstName,
          customerLastName: lastName,
          customerEmail: p.borrowerEmail,
          customerPhone: p.borrowerPhone,
          propertyAddress: p.propertyAddress,
          loanData: {
            loanAmount: p.loanAmount || 0,
            propertyValue: 0,
            loanType: p.loanType || 'unknown',
            propertyType: p.propertyType || 'unknown',
            loanTerm: p.loanTermMonths ? `${p.loanTermMonths} months` : '12 months',
          },
          interestRate: p.interestRate ? `${p.interestRate}%` : '—',
          stage: projectToStepKey.get(p.id) || p.currentStage || 'application',
          projectStatus: p.status || 'active',
          currentStage: p.currentStage,
          progressPercentage: p.progressPercentage || 0,
          createdAt: p.createdAt,
          targetCloseDate: p.targetCloseDate,
          userName: p.userName,
          userEmail: p.userEmail,
          quoteId: p.quoteId,
          googleDriveFolderId: p.googleDriveFolderId || null,
          googleDriveFolderUrl: p.googleDriveFolderUrl || null,
          driveSyncStatus: p.driveSyncStatus || 'NOT_ENABLED',
        };
      });
      
      // Filter by search term if provided
      let filteredDeals = deals;
      if (search) {
        const searchLower = (search as string).toLowerCase();
        filteredDeals = deals.filter(d => 
          d.customerFirstName?.toLowerCase().includes(searchLower) ||
          d.customerLastName?.toLowerCase().includes(searchLower) ||
          d.propertyAddress?.toLowerCase().includes(searchLower) ||
          d.userName?.toLowerCase().includes(searchLower) ||
          d.projectNumber?.toLowerCase().includes(searchLower)
        );
      }
      
      // Filter by status if provided
      if (status && status !== 'all') {
        filteredDeals = filteredDeals.filter(d => d.stage === status);
      }
      
      // Calculate stats
      const totalDeals = allProjects.length;
      const totalLoanAmount = allProjects.reduce((sum, p) => sum + (p.loanAmount || 0), 0);
      
      // Calculate pipeline by loan type
      const loanTypeStats: Record<string, { count: number; amount: number }> = {};
      allProjects.forEach(p => {
        const loanType = p.loanType || 'Unknown';
        if (!loanTypeStats[loanType]) {
          loanTypeStats[loanType] = { count: 0, amount: 0 };
        }
        loanTypeStats[loanType].count++;
        loanTypeStats[loanType].amount += p.loanAmount || 0;
      });
      
      // Calculate pipeline grouped by program
      const allProjectStages = await db.select({
        projectId: projectStages.projectId,
        stageKey: projectStages.stageKey,
        status: projectStages.status,
        programStepId: projectStages.programStepId,
      }).from(projectStages);

      const allProgramStepMappings = await db.select({
        programStepId: programWorkflowSteps.id,
        programId: programWorkflowSteps.programId,
        stepKey: workflowStepDefinitions.key,
        stepName: workflowStepDefinitions.name,
        stepColor: workflowStepDefinitions.color,
        stepOrder: programWorkflowSteps.stepOrder,
      })
        .from(programWorkflowSteps)
        .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
        .orderBy(asc(programWorkflowSteps.stepOrder));
      const stepIdToKey = new Map(allProgramStepMappings.map(m => [m.programStepId, m.stepKey]));

      const projectCurrentStepKey = new Map<number, string>();
      const projectIds = [...new Set(allProjectStages.map(s => s.projectId))];
      for (const pid of projectIds) {
        const stages = allProjectStages.filter(s => s.projectId === pid);
        const inProgress = stages.find(s => s.status === 'in_progress');
        if (inProgress) {
          if (inProgress.programStepId && stepIdToKey.has(inProgress.programStepId)) {
            projectCurrentStepKey.set(pid, stepIdToKey.get(inProgress.programStepId)!);
          } else {
            projectCurrentStepKey.set(pid, inProgress.stageKey);
          }
        }
      }

      // Get ALL active programs (not just ones with deals)
      const allActivePrograms = await db.select({ id: loanPrograms.id, name: loanPrograms.name })
        .from(loanPrograms)
        .where(eq(loanPrograms.isActive, true))
        .orderBy(asc(loanPrograms.sortOrder));

      // Build pipeline by program - include all configured programs
      const pipelineByProgram = allActivePrograms.map(prog => {
        const programDeals = allProjects.filter(p => p.programId === prog.id);
        const programSteps = allProgramStepMappings
          .filter(m => m.programId === prog.id)
          .sort((a, b) => a.stepOrder - b.stepOrder);

        const stages = programSteps.map(step => ({
          stage: step.stepKey,
          label: step.stepName,
          color: step.stepColor || '#6366f1',
          count: programDeals.filter(d => projectCurrentStepKey.get(d.id) === step.stepKey).length,
        }));

        return {
          programId: prog.id,
          programName: prog.name,
          totalDeals: programDeals.length,
          stages,
        };
      });

      // Deals without a program
      const unassignedDeals = allProjects.filter(p => !p.programId);
      if (unassignedDeals.length > 0) {
        pipelineByProgram.push({
          programId: 0,
          programName: 'Unassigned',
          totalDeals: unassignedDeals.length,
          stages: [],
        });
      }

      // Keep flat stageStats for backward compatibility (badge labels etc.)
      const allStepDefs = await db.select({
        id: workflowStepDefinitions.id,
        name: workflowStepDefinitions.name,
        key: workflowStepDefinitions.key,
        color: workflowStepDefinitions.color,
        sortOrder: workflowStepDefinitions.sortOrder,
      })
        .from(workflowStepDefinitions)
        .where(eq(workflowStepDefinitions.isActive, true))
        .orderBy(asc(workflowStepDefinitions.sortOrder));

      const stageStats = allStepDefs.map(step => ({
        stage: step.key,
        label: step.name,
        color: step.color || '#6366f1',
        count: allProjects.filter(p => projectCurrentStepKey.get(p.id) === step.key).length,
      }));
      
      // Calculate deals by month (last 6 months)
      const now = new Date();
      const monthlyStats: { month: string; count: number; amount: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const monthName = monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        
        const monthDeals = allProjects.filter(p => {
          const created = new Date(p.createdAt!);
          return created >= monthDate && created <= monthEnd;
        });
        
        monthlyStats.push({
          month: monthName,
          count: monthDeals.length,
          amount: monthDeals.reduce((sum, p) => sum + (p.loanAmount || 0), 0)
        });
      }
      
      res.json({
        deals: filteredDeals,
        stats: {
          totalDeals,
          totalLoanAmount,
          totalRevenue: 0,
          totalCommission: 0,
          loanTypeStats,
          stageStats,
          pipelineByProgram,
          monthlyStats
        }
      });
    } catch (error) {
      console.error('Admin deals error:', error);
      res.status(500).json({ error: 'Failed to load deals' });
    }
  });

  // Admin - Create deal manually
  app.post('/api/admin/deals', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { 
        customerFirstName, 
        customerLastName, 
        borrowerEmail,
        borrowerPhone,
        propertyAddress, 
        loanAmount, 
        propertyValue, 
        interestRate, 
        loanType, 
        programId: reqProgramId,
        propertyType, 
        stage,
        partnerId,
        partnerName,
        loanPurpose,
        targetCloseDate,
      } = req.body;
      
      if (!customerFirstName || !customerLastName || !propertyAddress || !loanAmount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const loanAmountNum = parseFloat(loanAmount);
      const propertyValueNum = propertyValue ? parseFloat(propertyValue) : loanAmountNum * 1.25;
      const ltv = ((loanAmountNum / propertyValueNum) * 100).toFixed(0) + '%';
      
      const parsedProgramId = reqProgramId ? parseInt(reqProgramId) : null;
      const effectiveLoanType = loanType || 'rtl';
      const borrowerName = `${customerFirstName} ${customerLastName}`.trim();
      const effectiveLoanPurpose = loanPurpose || 'purchase';
      
      const [deal] = await db.insert(savedQuotes).values({
        userId: req.user!.id,
        partnerId: partnerId ? parseInt(partnerId) : null,
        partnerName: partnerName || null,
        customerFirstName,
        customerLastName,
        propertyAddress,
        programId: parsedProgramId,
        loanData: {
          loanAmount: loanAmountNum,
          propertyValue: propertyValueNum,
          ltv,
          loanType: effectiveLoanType,
          loanPurpose: effectiveLoanPurpose,
          propertyType: propertyType || 'single-family-residence',
          loanTerm: '12 months',
        },
        interestRate: interestRate || 'TBD',
        pointsCharged: 0,
        pointsAmount: 0,
        tpoPremiumAmount: 0,
        totalRevenue: 0,
        commission: 0,
        stage: stage || 'initial-review',
      }).returning();
      
      const projectNumber = await storage.generateProjectNumber();
      const borrowerToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
      
      const parsedTargetClose = targetCloseDate 
        ? new Date(targetCloseDate) 
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      
      const project = await storage.createProject({
        userId: req.user!.id,
        projectName: `${borrowerName} - ${propertyAddress}`,
        projectNumber,
        loanAmount: loanAmountNum,
        interestRate: interestRate ? parseFloat(interestRate) : null,
        loanTermMonths: null,
        loanType: effectiveLoanType,
        programId: parsedProgramId,
        propertyAddress,
        propertyType: propertyType || 'single-family-residence',
        borrowerName,
        borrowerEmail: borrowerEmail || '',
        borrowerPhone: borrowerPhone || null,
        status: 'active',
        currentStage: 'documentation',
        progressPercentage: 0,
        applicationDate: new Date(),
        targetCloseDate: parsedTargetClose,
        borrowerPortalToken: borrowerToken,
        borrowerPortalEnabled: true,
        quoteId: deal.id,
        notes: null,
      });
      
      const { buildProjectPipelineFromProgram } = await import('./services/projectPipeline');
      const pipelineResult = await buildProjectPipelineFromProgram(project.id, parsedProgramId);
      console.log(`Admin deal pipeline created: ${pipelineResult.stagesCreated} stages, ${pipelineResult.tasksCreated} tasks, ${pipelineResult.documentsCreated} documents (program: ${pipelineResult.usedProgramTemplate ? pipelineResult.programName : 'legacy'})`);
      
      await storage.createProjectActivity({
        projectId: project.id,
        userId: req.user!.id,
        activityType: 'project_created',
        activityDescription: `Deal ${projectNumber} created manually by admin`,
        visibleToBorrower: true,
      });

      res.json({ deal, projectId: project.id });
    } catch (error) {
      console.error('Admin create deal error:', error);
      res.status(500).json({ error: 'Failed to create deal' });
    }
  });

  // Admin - Get single deal (project) by ID
  app.get('/api/admin/deals/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      
      const [project] = await db.select({
        id: projects.id,
        userId: projects.userId,
        projectNumber: projects.projectNumber,
        projectName: projects.projectName,
        borrowerName: projects.borrowerName,
        borrowerEmail: projects.borrowerEmail,
        borrowerPhone: projects.borrowerPhone,
        propertyAddress: projects.propertyAddress,
        propertyType: projects.propertyType,
        loanAmount: projects.loanAmount,
        interestRate: projects.interestRate,
        loanTermMonths: projects.loanTermMonths,
        loanType: projects.loanType,
        programId: projects.programId,
        status: projects.status,
        currentStage: projects.currentStage,
        progressPercentage: projects.progressPercentage,
        createdAt: projects.createdAt,
        targetCloseDate: projects.targetCloseDate,
        quoteId: projects.quoteId,
        borrowerPortalToken: projects.borrowerPortalToken,
        borrowerPortalEnabled: projects.borrowerPortalEnabled,
        brokerPortalToken: projects.brokerPortalToken,
        brokerPortalEnabled: projects.brokerPortalEnabled,
        metadata: projects.metadata,
        userName: users.fullName,
        userEmail: users.email,
      })
        .from(projects)
        .leftJoin(users, eq(projects.userId, users.id))
        .where(eq(projects.id, projectId))
        .limit(1);
      
      if (!project) {
        return res.status(404).json({ error: 'Deal not found' });
      }
      
      // Transform project to deal format for frontend compatibility
      const nameParts = (project.borrowerName || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      let resolvedLoanType = project.loanType;
      if (!resolvedLoanType && project.quoteId) {
        const [linkedQuote] = await db.select({ loanData: savedQuotes.loanData })
          .from(savedQuotes)
          .where(eq(savedQuotes.id, project.quoteId))
          .limit(1);
        if (linkedQuote?.loanData) {
          const qld = linkedQuote.loanData as Record<string, unknown>;
          resolvedLoanType = (qld.loanType as string) || null;
          if (resolvedLoanType && resolvedLoanType !== 'unknown') {
            await db.update(projects)
              .set({ loanType: resolvedLoanType })
              .where(eq(projects.id, project.id));
          }
        }
      }
      
      let programName: string | null = null;
      if (project.programId) {
        const [prog] = await db.select({ name: loanPrograms.name })
          .from(loanPrograms)
          .where(eq(loanPrograms.id, project.programId))
          .limit(1);
        programName = prog?.name || null;
      }

      // Determine current workflow step key from projectStages
      const pStages = await db.select({
        stageKey: projectStages.stageKey,
        status: projectStages.status,
        programStepId: projectStages.programStepId,
        stageOrder: projectStages.stageOrder,
      })
        .from(projectStages)
        .where(eq(projectStages.projectId, projectId))
        .orderBy(asc(projectStages.stageOrder));

      let currentWorkflowStepKey: string | null = null;
      const inProgressStage = pStages.find(s => s.status === 'in_progress');
      if (inProgressStage) {
        if (inProgressStage.programStepId) {
          const [stepMapping] = await db.select({ stepKey: workflowStepDefinitions.key })
            .from(programWorkflowSteps)
            .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
            .where(eq(programWorkflowSteps.id, inProgressStage.programStepId))
            .limit(1);
          currentWorkflowStepKey = stepMapping?.stepKey || inProgressStage.stageKey;
        } else {
          currentWorkflowStepKey = inProgressStage.stageKey;
        }
      }

      let applicationData: Record<string, any> | null = null;
      const meta = project.metadata as Record<string, any> | null;
      if (meta?.applicationData) {
        applicationData = meta.applicationData;
      } else if (meta && Object.keys(meta).length > 0) {
        const metaSkipKeys = ['source', 'pandadocDocumentId', 'pandadocEnvelopeId'];
        const metaEntries = Object.entries(meta).filter(([k]) => !metaSkipKeys.includes(k));
        if (metaEntries.length > 0) {
          applicationData = Object.fromEntries(metaEntries);
        }
      }
      if (!applicationData && project.quoteId) {
        const qId = project.quoteId;
        const [linkedQuoteForApp] = await db.select({ loanData: savedQuotes.loanData })
          .from(savedQuotes)
          .where(eq(savedQuotes.id, qId!))
          .limit(1);
        if (linkedQuoteForApp?.loanData) {
          applicationData = linkedQuoteForApp.loanData as Record<string, any>;
        }
      }

      const deal = {
        id: project.id,
        projectId: project.id,
        projectNumber: project.projectNumber,
        userId: project.userId,
        customerFirstName: firstName,
        customerLastName: lastName,
        customerEmail: project.borrowerEmail,
        customerPhone: project.borrowerPhone,
        propertyAddress: project.propertyAddress,
        loanData: {
          loanAmount: project.loanAmount || 0,
          propertyValue: 0,
          loanType: resolvedLoanType || 'unknown',
          propertyType: project.propertyType || 'unknown',
          loanTerm: project.loanTermMonths ? `${project.loanTermMonths} months` : '12 months',
        },
        applicationData,
        interestRate: project.interestRate ? `${project.interestRate}%` : '—',
        stage: currentWorkflowStepKey || project.currentStage || 'application',
        projectStatus: project.status || 'active',
        currentStage: project.currentStage,
        progressPercentage: project.progressPercentage || 0,
        createdAt: project.createdAt,
        targetCloseDate: project.targetCloseDate,
        userName: project.userName,
        userEmail: project.userEmail,
        quoteId: project.quoteId,
        borrowerPortalToken: project.borrowerPortalToken,
        borrowerPortalEnabled: project.borrowerPortalEnabled,
        brokerPortalToken: project.brokerPortalToken,
        brokerPortalEnabled: project.brokerPortalEnabled,
        programId: project.programId,
        programName,
      };
      
      const docs = await db.select()
        .from(dealDocuments)
        .where(eq(dealDocuments.dealId, projectId))
        .orderBy(dealDocuments.sortOrder);

      const props = await db.select()
        .from(dealProperties)
        .where(eq(dealProperties.dealId, projectId))
        .orderBy(dealProperties.sortOrder);
      
      res.json({ deal, documents: docs, project, properties: props });
    } catch (error) {
      console.error('Admin get deal error:', error);
      res.status(500).json({ error: 'Failed to load deal' });
    }
  });

  // Admin - Get project for a deal (deal ID is now project ID)
  app.get('/api/admin/deals/:dealId/project', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.dealId);
      
      // Since deals now ARE projects, return the project directly
      const [project] = await db.select({
        id: projects.id,
        projectName: projects.projectName,
        status: projects.status,
        progressPercentage: projects.progressPercentage,
        currentStage: projects.currentStage,
      })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      
      if (!project) {
        return res.json({ project: null });
      }
      
      res.json({ project });
    } catch (error) {
      console.error('Admin get project error:', error);
      res.status(500).json({ error: 'Failed to load project' });
    }
  });

  // Admin - Get program workflow stages for a deal (used by stage dropdown)
  app.get('/api/admin/deals/:dealId/program-stages', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      
      const [project] = await db.select({
        id: projects.id,
        programId: projects.programId,
      })
        .from(projects)
        .where(eq(projects.id, dealId))
        .limit(1);
      
      if (!project || !project.programId) {
        return res.json({ stages: [] });
      }
      
      const steps = await db.select({
        id: programWorkflowSteps.id,
        stepOrder: programWorkflowSteps.stepOrder,
        stepKey: workflowStepDefinitions.key,
        stepName: workflowStepDefinitions.name,
        stepColor: workflowStepDefinitions.color,
        stepIcon: workflowStepDefinitions.icon,
      })
        .from(programWorkflowSteps)
        .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
        .where(eq(programWorkflowSteps.programId, project.programId))
        .orderBy(asc(programWorkflowSteps.stepOrder));
      
      const stages = steps.map(s => ({
        id: s.id,
        key: s.stepKey,
        label: s.stepName,
        color: s.stepColor || '#6366f1',
        icon: s.stepIcon,
        sortOrder: s.stepOrder,
        isActive: true,
      }));
      
      res.json({ stages });
    } catch (error) {
      console.error('Admin get deal program stages error:', error);
      res.status(500).json({ error: 'Failed to load program stages' });
    }
  });

  // Admin - Get deal properties
  app.get('/api/admin/deals/:dealId/properties', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const props = await db.select().from(dealProperties).where(eq(dealProperties.dealId, dealId)).orderBy(dealProperties.sortOrder);
      res.json(props);
    } catch (error) {
      console.error('Get deal properties error:', error);
      res.status(500).json({ error: 'Failed to load properties' });
    }
  });

  // Admin - Add deal property
  app.post('/api/admin/deals/:dealId/properties', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const { address, city, state, zip, propertyType, estimatedValue, isPrimary } = req.body;
      if (!address || !address.trim()) {
        return res.status(400).json({ error: 'Address is required' });
      }
      if (isPrimary) {
        await db.update(dealProperties).set({ isPrimary: false }).where(eq(dealProperties.dealId, dealId));
      }
      const existingCount = await db.select({ count: sql<number>`count(*)` }).from(dealProperties).where(eq(dealProperties.dealId, dealId));
      const count = Number(existingCount[0]?.count || 0);
      const [prop] = await db.insert(dealProperties).values({
        dealId,
        address: address.trim(),
        city: city || null,
        state: state || null,
        zip: zip || null,
        propertyType: propertyType || null,
        estimatedValue: estimatedValue || null,
        isPrimary: isPrimary || count === 0,
        sortOrder: count,
      }).returning();
      res.json(prop);
    } catch (error) {
      console.error('Add deal property error:', error);
      res.status(500).json({ error: 'Failed to add property' });
    }
  });

  // Admin - Update deal property
  app.patch('/api/admin/deals/:dealId/properties/:propId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const propId = parseInt(req.params.propId);
      const { address, city, state, zip, propertyType, estimatedValue, isPrimary } = req.body;
      const updateData: Record<string, any> = {};
      if (address !== undefined) updateData.address = address.trim();
      if (city !== undefined) updateData.city = city;
      if (state !== undefined) updateData.state = state;
      if (zip !== undefined) updateData.zip = zip;
      if (propertyType !== undefined) updateData.propertyType = propertyType;
      if (estimatedValue !== undefined) updateData.estimatedValue = estimatedValue;
      if (isPrimary !== undefined) {
        updateData.isPrimary = isPrimary;
        if (isPrimary) {
          await db.update(dealProperties).set({ isPrimary: false }).where(and(eq(dealProperties.dealId, dealId), sql`id != ${propId}`));
        }
      }
      const [updated] = await db.update(dealProperties).set(updateData).where(and(eq(dealProperties.id, propId), eq(dealProperties.dealId, dealId))).returning();
      if (!updated) return res.status(404).json({ error: 'Property not found' });
      res.json(updated);
    } catch (error) {
      console.error('Update deal property error:', error);
      res.status(500).json({ error: 'Failed to update property' });
    }
  });

  // Admin - Delete deal property
  app.delete('/api/admin/deals/:dealId/properties/:propId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const propId = parseInt(req.params.propId);
      const [deleted] = await db.delete(dealProperties).where(and(eq(dealProperties.id, propId), eq(dealProperties.dealId, dealId))).returning();
      if (!deleted) return res.status(404).json({ error: 'Property not found' });
      if (deleted.isPrimary) {
        const [nextProp] = await db.select().from(dealProperties).where(eq(dealProperties.dealId, dealId)).orderBy(dealProperties.sortOrder).limit(1);
        if (nextProp) {
          await db.update(dealProperties).set({ isPrimary: true }).where(eq(dealProperties.id, nextProp.id));
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Delete deal property error:', error);
      res.status(500).json({ error: 'Failed to delete property' });
    }
  });

  // Unified Checklist - single source of truth combining docs + tasks, filtered by viewer role
  app.get('/api/projects/:id/checklist', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const projectId = parseInt(req.params.id);
      const viewerRole = req.user!.role === 'super_admin' || req.user!.role === 'admin' ? 'admin' : 
                         req.user!.userType === 'borrower' ? 'borrower' : 'broker';

      const project = await storage.getProjectById(projectId, userId);
      if (!project) return res.status(404).json({ error: 'Deal not found' });

      const docs = await db.select().from(dealDocuments)
        .where(eq(dealDocuments.dealId, projectId))
        .orderBy(asc(dealDocuments.sortOrder));

      const docsWithFiles = await Promise.all(docs.map(async (doc) => {
        const files = await db.select().from(dealDocumentFiles)
          .where(eq(dealDocumentFiles.documentId, doc.id))
          .orderBy(asc(dealDocumentFiles.sortOrder));
        return { ...doc, files };
      }));

      const tasks = await db.select().from(projectTasks)
        .where(eq(projectTasks.projectId, projectId))
        .orderBy(asc(projectTasks.createdAt));

      const stages = await db.select().from(projectStages)
        .where(eq(projectStages.projectId, projectId))
        .orderBy(asc(projectStages.stageOrder));

      const visibleDocs = docsWithFiles.filter(doc => {
        const vis = doc.visibility || 'all';
        if (vis === 'all') return true;
        return vis === viewerRole;
      });

      const visibleTasks = tasks.filter(task => {
        if (viewerRole === 'admin') return true;
        const taskAssignee = (task.assignedTo || '').toLowerCase();
        if (viewerRole === 'borrower') {
          return task.visibleToBorrower !== false && (taskAssignee === '' || taskAssignee === 'borrower' || taskAssignee === 'all');
        }
        if (viewerRole === 'broker') {
          return taskAssignee === '' || taskAssignee === 'broker' || taskAssignee === 'borrower' || taskAssignee === 'all';
        }
        return true;
      });

      const checklistItems: any[] = [];

      for (const doc of visibleDocs) {
        checklistItems.push({
          id: `doc-${doc.id}`,
          type: 'document' as const,
          itemId: doc.id,
          stageId: doc.stageId,
          title: doc.documentName,
          description: doc.documentDescription,
          category: doc.documentCategory,
          status: doc.status,
          isRequired: doc.isRequired,
          assignedTo: doc.assignedTo || 'borrower',
          visibility: doc.visibility || 'all',
          sortOrder: doc.sortOrder || 0,
          filePath: doc.filePath,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          uploadedAt: doc.uploadedAt,
          uploadedBy: doc.uploadedBy,
          reviewedAt: doc.reviewedAt,
          reviewedBy: doc.reviewedBy,
          reviewNotes: doc.reviewNotes,
          files: doc.files,
          createdAt: doc.createdAt,
        });
      }

      for (const task of visibleTasks) {
        checklistItems.push({
          id: `task-${task.id}`,
          type: 'task' as const,
          itemId: task.id,
          stageId: task.stageId,
          title: task.taskTitle,
          description: task.taskDescription,
          category: task.taskType,
          status: task.status,
          isRequired: true,
          assignedTo: task.assignedTo || 'admin',
          visibility: task.visibleToBorrower ? 'all' : 'admin',
          sortOrder: 0,
          priority: task.priority,
          borrowerActionRequired: task.borrowerActionRequired,
          completedAt: task.completedAt,
          completedBy: task.completedBy,
          createdAt: task.createdAt,
        });
      }

      res.json({
        success: true,
        viewerRole,
        items: checklistItems,
        stages: stages.map(s => ({
          id: s.id,
          name: s.stageName,
          key: s.stageKey,
          order: s.stageOrder,
          status: s.status,
          description: s.stageDescription,
        })),
      });
    } catch (error) {
      console.error('Unified checklist error:', error);
      res.status(500).json({ error: 'Failed to load checklist' });
    }
  });

  // Unified Checklist - borrower portal (token-based)
  app.get('/api/portal/:token/checklist', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const project = await storage.getProjectByToken(token);
      if (!project) return res.status(404).json({ error: 'Deal not found' });
      if (!project.borrowerPortalEnabled) return res.status(403).json({ error: 'Portal disabled' });

      const docs = await db.select().from(dealDocuments)
        .where(eq(dealDocuments.dealId, project.id))
        .orderBy(asc(dealDocuments.sortOrder));

      const docsWithFiles = await Promise.all(docs.map(async (doc) => {
        const files = await db.select().from(dealDocumentFiles)
          .where(eq(dealDocumentFiles.documentId, doc.id))
          .orderBy(asc(dealDocumentFiles.sortOrder));
        return { ...doc, files };
      }));

      const tasks = await db.select().from(projectTasks)
        .where(eq(projectTasks.projectId, project.id))
        .orderBy(asc(projectTasks.createdAt));

      const stages = await db.select().from(projectStages)
        .where(eq(projectStages.projectId, project.id))
        .orderBy(asc(projectStages.stageOrder));

      const visibleDocs = docsWithFiles.filter(doc => {
        const vis = doc.visibility || 'all';
        return vis === 'all' || vis === 'borrower';
      });

      const visibleTasks = tasks.filter(task => {
        const taskAssignee = (task.assignedTo || '').toLowerCase();
        return task.visibleToBorrower !== false && (taskAssignee === '' || taskAssignee === 'borrower' || taskAssignee === 'all');
      });

      const checklistItems: any[] = [];

      for (const doc of visibleDocs) {
        checklistItems.push({
          id: `doc-${doc.id}`,
          type: 'document' as const,
          itemId: doc.id,
          stageId: doc.stageId,
          title: doc.documentName,
          description: doc.documentDescription,
          category: doc.documentCategory,
          status: doc.status,
          isRequired: doc.isRequired,
          assignedTo: doc.assignedTo || 'borrower',
          visibility: doc.visibility || 'all',
          sortOrder: doc.sortOrder || 0,
          filePath: doc.filePath,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          uploadedAt: doc.uploadedAt,
          uploadedBy: doc.uploadedBy,
          reviewedAt: doc.reviewedAt,
          reviewedBy: doc.reviewedBy,
          reviewNotes: doc.reviewNotes,
          files: doc.files,
          createdAt: doc.createdAt,
        });
      }

      for (const task of visibleTasks) {
        checklistItems.push({
          id: `task-${task.id}`,
          type: 'task' as const,
          itemId: task.id,
          stageId: task.stageId,
          title: task.taskTitle,
          description: task.taskDescription,
          category: task.taskType,
          status: task.status,
          isRequired: true,
          assignedTo: task.assignedTo || 'admin',
          visibility: 'all',
          sortOrder: 0,
          priority: task.priority,
          borrowerActionRequired: task.borrowerActionRequired,
          completedAt: task.completedAt,
          completedBy: task.completedBy,
          createdAt: task.createdAt,
        });
      }

      res.json({
        success: true,
        viewerRole: 'borrower',
        items: checklistItems,
        stages: stages.map(s => ({
          id: s.id,
          name: s.stageName,
          key: s.stageKey,
          order: s.stageOrder,
          status: s.status,
          description: s.stageDescription,
        })),
      });
    } catch (error) {
      console.error('Portal checklist error:', error);
      res.status(500).json({ error: 'Failed to load checklist' });
    }
  });

  // Admin Unified Checklist (same data, admin role)
  app.get('/api/admin/deals/:dealId/checklist', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);

      const docs = await db.select().from(dealDocuments)
        .where(eq(dealDocuments.dealId, dealId))
        .orderBy(asc(dealDocuments.sortOrder));

      const docsWithFiles = await Promise.all(docs.map(async (doc) => {
        const files = await db.select().from(dealDocumentFiles)
          .where(eq(dealDocumentFiles.documentId, doc.id))
          .orderBy(asc(dealDocumentFiles.sortOrder));
        return { ...doc, files };
      }));

      const tasks = await db.select().from(projectTasks)
        .where(eq(projectTasks.projectId, dealId))
        .orderBy(asc(projectTasks.createdAt));

      const stages = await db.select().from(projectStages)
        .where(eq(projectStages.projectId, dealId))
        .orderBy(asc(projectStages.stageOrder));

      const checklistItems: any[] = [];

      for (const doc of docsWithFiles) {
        checklistItems.push({
          id: `doc-${doc.id}`,
          type: 'document' as const,
          itemId: doc.id,
          stageId: doc.stageId,
          title: doc.documentName,
          description: doc.documentDescription,
          category: doc.documentCategory,
          status: doc.status,
          isRequired: doc.isRequired,
          assignedTo: doc.assignedTo || 'borrower',
          visibility: doc.visibility || 'all',
          sortOrder: doc.sortOrder || 0,
          filePath: doc.filePath,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          uploadedAt: doc.uploadedAt,
          uploadedBy: doc.uploadedBy,
          reviewedAt: doc.reviewedAt,
          reviewedBy: doc.reviewedBy,
          reviewNotes: doc.reviewNotes,
          files: doc.files,
          createdAt: doc.createdAt,
        });
      }

      for (const task of tasks) {
        checklistItems.push({
          id: `task-${task.id}`,
          type: 'task' as const,
          itemId: task.id,
          stageId: task.stageId,
          title: task.taskTitle,
          description: task.taskDescription,
          category: task.taskType,
          status: task.status,
          isRequired: true,
          assignedTo: task.assignedTo || 'admin',
          visibility: task.visibleToBorrower ? 'all' : 'admin',
          sortOrder: 0,
          priority: task.priority,
          borrowerActionRequired: task.borrowerActionRequired,
          completedAt: task.completedAt,
          completedBy: task.completedBy,
          createdAt: task.createdAt,
        });
      }

      res.json({
        success: true,
        viewerRole: 'admin',
        items: checklistItems,
        stages: stages.map(s => ({
          id: s.id,
          name: s.stageName,
          key: s.stageKey,
          order: s.stageOrder,
          status: s.status,
          description: s.stageDescription,
        })),
      });
    } catch (error) {
      console.error('Admin checklist error:', error);
      res.status(500).json({ error: 'Failed to load checklist' });
    }
  });

  // Admin - Get deal documents
  app.get('/api/admin/deals/:dealId/documents', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      
      const documents = await db.select()
        .from(dealDocuments)
        .where(eq(dealDocuments.dealId, dealId))
        .orderBy(dealDocuments.sortOrder);
      
      res.json({ documents });
    } catch (error) {
      console.error('Admin deal documents error:', error);
      res.status(500).json({ error: 'Failed to load documents' });
    }
  });

  // Admin - Update deal document status
  app.patch('/api/admin/deals/:dealId/documents/:docId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const docId = parseInt(req.params.docId);
      const { status, reviewNotes } = req.body;
      
      const validStatuses = ['pending', 'uploaded', 'ai_reviewed', 'approved', 'rejected', 'not_applicable'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      
      const updateData: Record<string, any> = {};
      if (status) updateData.status = status;
      if (reviewNotes !== undefined) updateData.reviewNotes = reviewNotes;
      
      if (status === 'approved' || status === 'rejected') {
        updateData.reviewedAt = new Date();
        updateData.reviewedBy = req.user!.id;
      }
      
      const [updated] = await db.update(dealDocuments)
        .set(updateData)
        .where(eq(dealDocuments.id, docId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Log activity, digest, and deal memory when document is approved or rejected
      if (status === 'approved' || status === 'rejected') {
        const actionText = status === 'approved' ? 'approved' : 'rejected';

        try {
          await storage.createProjectActivity({
            projectId: dealId,
            userId: req.user!.id,
            activityType: `document_${status}`,
            activityDescription: `Document "${updated.documentName}" ${actionText}${reviewNotes ? ` — ${reviewNotes}` : ''}`,
            visibleToBorrower: true,
          });
        } catch (activityError) {
          console.error('Failed to log document review activity:', activityError);
        }

        try {
          await db.insert(dealMemoryEntries).values({
            dealId,
            entryType: status === 'approved' ? 'document_approved' : 'document_rejected',
            title: `${updated.documentName || updated.documentCategory || 'Document'} ${actionText}`,
            description: reviewNotes || undefined,
            sourceType: 'admin',
            sourceUserId: req.user!.id,
            metadata: { documentId: docId, category: updated.documentCategory },
          });
        } catch (e) { console.error('Memory entry error:', e); }

        try {
          const [project] = await db.select({ id: projects.id })
            .from(projects)
            .where(eq(projects.quoteId, dealId))
            .limit(1);
          
          if (project) {
            await db.insert(loanUpdates).values({
              projectId: project.id,
              updateType: `doc_${status}`,
              summary: `Document "${updated.documentName}" has been ${actionText}`,
              meta: { 
                documentId: docId, 
                documentName: updated.documentName,
                reviewNotes: reviewNotes || null 
              },
              performedBy: req.user!.id,
            });
          }
        } catch (digestError) {
          console.error('Failed to log document update for digest:', digestError);
        }

        if (status === 'approved') {
          try {
            const { isDriveIntegrationEnabled, syncDealDocumentToDrive } = await import('./services/googleDrive');
            const driveEnabled = await isDriveIntegrationEnabled();
            if (driveEnabled) {
              syncDealDocumentToDrive(docId).catch((err: any) => {
                console.error(`Drive sync failed for approved doc ${docId}:`, err.message);
              });
            }
          } catch (driveErr: any) {
            console.error('Drive sync check error on approval:', driveErr.message);
          }
        }

        if (status === 'rejected') {
          try {
            const [project] = await db.select().from(projects).where(eq(projects.id, dealId)).limit(1);
            if (project) {
              const borrowerEmail = project.borrowerEmail;
              const borrowerUser = project.userId ? await db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, project.userId)).then(r => r[0]) : null;
              const emailTo = borrowerEmail || borrowerUser?.email;
              const borrowerName = project.borrowerName || borrowerUser?.fullName || 'Borrower';
              if (emailTo) {
                const { getResendClient } = await import('./email');
                const { client, fromEmail } = await getResendClient();
                await client.emails.send({
                  from: fromEmail || 'Lendry.AI <info@lendry.ai>',
                  to: emailTo,
                  subject: `Action Required: Document Rejected - ${updated.documentName}`,
                  html: `
                    <!DOCTYPE html><html><head><style>
                      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                      .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                      .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
                      .reason { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #dc2626; margin: 15px 0; }
                      .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
                    </style></head><body>
                      <div class="container">
                        <div class="header"><h1>Document Rejected</h1></div>
                        <div class="content">
                          <p>Hello ${borrowerName},</p>
                          <p>The following document for your loan (${project.loanNumber || `DEAL-${dealId}`}) has been reviewed and needs to be resubmitted:</p>
                          <p><strong>${updated.documentName}</strong></p>
                          ${reviewNotes ? `<div class="reason"><strong>Reason:</strong> ${reviewNotes}</div>` : ''}
                          <p>Please upload a corrected version through your borrower portal at your earliest convenience.</p>
                        </div>
                        <div class="footer"><p>Powered by Lendry.AI</p></div>
                      </div>
                    </body></html>
                  `
                });
              }
            }
          } catch (emailErr) {
            console.error('Failed to send rejection email:', emailErr);
          }
        }
      }
      
      res.json({ document: updated });
    } catch (error) {
      console.error('Admin update document error:', error);
      res.status(500).json({ error: 'Failed to update document' });
    }
  });

  // Bulk approve all ai_reviewed documents for a deal
  app.post('/api/admin/deals/:dealId/documents/approve-all', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      
      const aiReviewedDocs = await db.select()
        .from(dealDocuments)
        .where(
          and(
            eq(dealDocuments.dealId, dealId),
            eq(dealDocuments.status, 'ai_reviewed')
          )
        );
      
      if (aiReviewedDocs.length === 0) {
        return res.json({ approved: 0, message: 'No documents to approve' });
      }
      
      await db.update(dealDocuments)
        .set({ 
          status: 'approved',
          reviewedBy: req.user!.id,
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(dealDocuments.dealId, dealId),
            eq(dealDocuments.status, 'ai_reviewed')
          )
        );
      
      // Trigger Google Drive sync for each approved document
      try {
        const { isDriveIntegrationEnabled, syncDealDocumentToDrive } = await import('./services/googleDrive');
        const driveEnabled = await isDriveIntegrationEnabled();
        if (driveEnabled) {
          for (const doc of aiReviewedDocs) {
            syncDealDocumentToDrive(doc.id).catch((err: any) => {
              console.error(`Drive sync failed for bulk-approved doc ${doc.id}:`, err.message);
            });
          }
        }
      } catch (driveErr: any) {
        console.error('Drive sync check error on bulk approval:', driveErr.message);
      }
      
      res.json({ approved: aiReviewedDocs.length, message: `${aiReviewedDocs.length} documents approved` });
    } catch (error: any) {
      console.error('Bulk approve error:', error);
      res.status(500).json({ error: 'Failed to approve documents' });
    }
  });

  // Admin - Upload document file (request presigned URL or direct upload)
  app.post('/api/admin/deals/:dealId/documents/:docId/upload-url', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const docId = parseInt(req.params.docId);
      const { name, size, contentType } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'File name is required' });
      }
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const isLocal = uploadURL.startsWith('__local__:');
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      
      res.json({
        uploadURL: isLocal ? `/api/admin/deals/${req.params.dealId}/documents/${docId}/upload-direct` : uploadURL,
        objectPath,
        docId,
        useDirectUpload: isLocal,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error('Admin upload URL error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  // Admin - Direct file upload (local storage fallback)
  const multerUpload = multer({ dest: path.join(process.cwd(), 'uploads', 'temp') });
  app.post('/api/admin/deals/:dealId/documents/:docId/upload-direct', authenticateUser, requireAdmin, multerUpload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }
      
      const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const objectId = randomUUID();
      const destPath = path.join(uploadsDir, objectId);
      fs.renameSync(req.file.path, destPath);
      
      const metaPath = destPath + '.meta';
      fs.writeFileSync(metaPath, JSON.stringify({
        fileName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
      }));
      
      const objectPath = `/objects/uploads/${objectId}`;
      
      res.json({
        objectPath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (error) {
      console.error('Direct upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // Admin - Complete document upload (add file to document slot - additive, not replacing)
  app.post('/api/admin/deals/:dealId/documents/:docId/upload-complete', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const docId = parseInt(req.params.docId);
      const { objectPath, fileName, fileSize, mimeType } = req.body;

      if (!objectPath || objectPath.includes('..')) {
        return res.status(400).json({ error: 'Object path is required' });
      }

      const [doc] = await db.select().from(dealDocuments).where(eq(dealDocuments.id, docId));
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const existingFiles = await db.select().from(dealDocumentFiles).where(eq(dealDocumentFiles.documentId, docId));
      const nextSortOrder = existingFiles.length;
      
      const [newFile] = await db.insert(dealDocumentFiles).values({
        documentId: docId,
        filePath: objectPath,
        fileName: fileName || null,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        uploadedAt: new Date(),
        uploadedBy: req.user!.id,
        sortOrder: nextSortOrder,
      }).returning();
      
      const [updated] = await db.update(dealDocuments)
        .set({
          filePath: objectPath,
          fileName: fileName || null,
          fileSize: fileSize || null,
          mimeType: mimeType || null,
          status: 'uploaded',
          uploadedAt: new Date(),
          uploadedBy: req.user!.id,
        })
        .where(eq(dealDocuments.id, docId))
        .returning();
      
      // Send notification to deal owner
      const deal = await db.select({ userId: savedQuotes.userId })
        .from(savedQuotes).where(eq(savedQuotes.id, dealId)).limit(1);
      if (deal[0]?.userId) {
        await postDealNotification(
          deal[0].userId, 
          dealId, 
          `Document uploaded: ${updated?.documentName || fileName || 'New document'}`
        );
      }
      
      // Google Drive sync for the new file (non-blocking)
      try {
        const { isDriveIntegrationEnabled, syncDealDocumentToDrive } = await import('./services/googleDrive');
        const driveEnabled = await isDriveIntegrationEnabled();
        if (driveEnabled && updated && newFile) {
          syncDealDocumentToDrive(updated.id, newFile.id).catch((err: any) => {
            console.error(`Drive sync failed for deal doc ${updated.id}:`, err.message);
          });
        }
      } catch (driveErr: any) {
        console.error('Drive sync check error:', driveErr.message);
      }

      maybeAutoTriggerPipeline(dealId, req.user!.id);
      
      res.json({ document: updated, file: newFile });
    } catch (error) {
      console.error('Admin upload complete error:', error);
      res.status(500).json({ error: 'Failed to update document record' });
    }
  });

  // Admin - Download/view document file
  app.get('/api/admin/deals/:dealId/documents/:docId/download', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const docId = parseInt(req.params.docId);
      
      const [doc] = await db.select()
        .from(dealDocuments)
        .where(eq(dealDocuments.id, docId))
        .limit(1);
      
      if (!doc || !doc.filePath) {
        return res.status(404).json({ error: 'Document file not found' });
      }
      
      // Get the file and stream it
      const objectFile = await objectStorageService.getObjectEntityFile(doc.filePath);
      
      // Set content disposition for download
      if (req.query.download === 'true' && doc.fileName) {
        res.set('Content-Disposition', `attachment; filename="${doc.fileName}"`);
      }
      
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error('Admin document download error:', error);
      res.status(500).json({ error: 'Failed to download document' });
    }
  });

  // Admin - Download/view individual file from document slot
  app.get('/api/admin/document-files/:fileId/download', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const [file] = await db.select().from(dealDocumentFiles).where(eq(dealDocumentFiles.id, fileId)).limit(1);
      if (!file || !file.filePath) {
        return res.status(404).json({ error: 'File not found' });
      }
      const objectFile = await objectStorageService.getObjectEntityFile(file.filePath);
      if (req.query.download === 'true' && file.fileName) {
        res.set('Content-Disposition', `attachment; filename="${file.fileName}"`);
      }
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error('Admin file download error:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });

  // Admin - Delete individual file from document slot
  app.delete('/api/admin/document-files/:fileId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const fileId = parseInt(req.params.fileId);
      const [file] = await db.select().from(dealDocumentFiles).where(eq(dealDocumentFiles.id, fileId)).limit(1);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
      await db.delete(dealDocumentFiles).where(eq(dealDocumentFiles.id, fileId));
      
      const remainingFiles = await db.select().from(dealDocumentFiles)
        .where(eq(dealDocumentFiles.documentId, file.documentId))
        .orderBy(dealDocumentFiles.sortOrder, dealDocumentFiles.createdAt);
      
      if (remainingFiles.length === 0) {
        await db.update(dealDocuments).set({
          filePath: null,
          fileName: null,
          fileSize: null,
          mimeType: null,
          status: 'pending',
          uploadedAt: null,
          uploadedBy: null,
        }).where(eq(dealDocuments.id, file.documentId));
      } else {
        const latestFile = remainingFiles[remainingFiles.length - 1];
        await db.update(dealDocuments).set({
          filePath: latestFile.filePath,
          fileName: latestFile.fileName,
          fileSize: latestFile.fileSize,
          mimeType: latestFile.mimeType,
        }).where(eq(dealDocuments.id, file.documentId));
      }
      
      res.json({ success: true, remainingFiles });
    } catch (error) {
      console.error('Admin file delete error:', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });


  // Override/action on a specific AI review finding
  app.patch('/api/admin/reviews/:reviewId/findings/:findingIndex/override', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const reviewId = parseInt(req.params.reviewId);
      const findingIndex = parseInt(req.params.findingIndex);
      const { action, reason } = req.body; // action: 'override_accept' | 'manual_review' | 'reject'

      if (!['override_accept', 'manual_review', 'reject', 'clear'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be override_accept, manual_review, reject, or clear' });
      }

      const [review] = await db.select().from(documentReviewResults).where(eq(documentReviewResults.id, reviewId));
      if (!review) {
        return res.status(404).json({ error: 'Review not found' });
      }

      const findings: any[] = review.findings ? JSON.parse(review.findings as string) : [];
      if (findingIndex < 0 || findingIndex >= findings.length) {
        return res.status(400).json({ error: 'Invalid finding index' });
      }

      if (action === 'clear') {
        delete findings[findingIndex].overrideAction;
        delete findings[findingIndex].overrideReason;
        delete findings[findingIndex].overriddenBy;
        delete findings[findingIndex].overriddenAt;
      } else {
        findings[findingIndex].overrideAction = action;
        findings[findingIndex].overrideReason = reason || null;
        findings[findingIndex].overriddenBy = req.user!.id;
        findings[findingIndex].overriddenAt = new Date().toISOString();
      }

      const failedFindings = findings.filter(f => f.status === 'fail');
      const allFailedResolved = failedFindings.every(f => f.overrideAction);
      const anyRejected = failedFindings.some(f => f.overrideAction === 'reject');
      const anyManualReview = failedFindings.some(f => f.overrideAction === 'manual_review');

      let newOverallStatus: string;
      if (failedFindings.length === 0) {
        newOverallStatus = 'pass';
      } else if (allFailedResolved) {
        if (anyRejected) {
          newOverallStatus = 'fail';
        } else if (anyManualReview) {
          newOverallStatus = 'needs_review';
        } else {
          newOverallStatus = 'pass';
        }
      } else {
        newOverallStatus = 'fail';
      }

      await db.update(documentReviewResults)
        .set({ findings: JSON.stringify(findings), overallStatus: newOverallStatus })
        .where(eq(documentReviewResults.id, reviewId));

      if (action === 'clear') {
        const [doc] = await db.select().from(dealDocuments).where(eq(dealDocuments.id, review.documentId));
        if (doc && (doc.status === 'rejected' || doc.status === 'approved')) {
          await db.update(dealDocuments)
            .set({ status: 'pending', reviewNotes: null })
            .where(eq(dealDocuments.id, review.documentId));
        }
      }

      if (action === 'reject' && reason) {
        const [doc] = await db.select().from(dealDocuments).where(eq(dealDocuments.id, review.documentId));
        if (doc) {
          await db.update(dealDocuments)
            .set({ status: 'rejected', reviewNotes: reason, reviewedAt: new Date(), reviewedBy: req.user!.id })
            .where(eq(dealDocuments.id, review.documentId));

          if (review.projectId) {
            try {
              await storage.createProjectActivity({
                projectId: review.projectId,
                userId: req.user!.id,
                activityType: 'document_rejected',
                activityDescription: `Document "${doc.documentName}" rejected — ${reason}`,
                visibleToBorrower: true,
                metadata: { documentId: doc.id, rejectionReason: reason, fromAiReview: true },
              });
            } catch (actErr) {
              console.error('Failed to log rejection activity:', actErr);
            }

            try {
              await db.insert(loanUpdates).values({
                projectId: review.projectId,
                updateType: 'doc_rejected',
                summary: `Document "${doc.documentName}" has been rejected`,
                meta: { documentId: doc.id, documentName: doc.documentName, reviewNotes: reason },
                performedBy: req.user!.id,
              });
            } catch (digestErr) {
              console.error('Failed to log rejection for digest:', digestErr);
            }

            try {
              const [project] = await db.select().from(projects).where(eq(projects.id, review.projectId)).limit(1);
              if (project) {
                const borrowerEmail = project.borrowerEmail;
                const borrowerUser = project.userId ? await db.select({ email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, project.userId)).then(r => r[0]) : null;
                const emailTo = borrowerEmail || borrowerUser?.email;
                const borrowerName = project.borrowerName || borrowerUser?.fullName || 'Borrower';
                if (emailTo) {
                  const { getResendClient } = await import('./email');
                  const { client, fromEmail } = await getResendClient();
                  await client.emails.send({
                    from: fromEmail || 'Lendry.AI <info@lendry.ai>',
                    to: emailTo,
                    subject: `Action Required: Document Rejected - ${doc.documentName}`,
                    html: `
                      <!DOCTYPE html><html><head><style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
                        .reason { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #dc2626; margin: 15px 0; }
                        .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 20px; }
                      </style></head><body>
                        <div class="container">
                          <div class="header"><h1>Document Rejected</h1></div>
                          <div class="content">
                            <p>Hello ${borrowerName},</p>
                            <p>The following document for your loan (${project.loanNumber || `DEAL-${review.projectId}`}) has been reviewed and needs to be resubmitted:</p>
                            <p><strong>${doc.documentName}</strong></p>
                            <div class="reason"><strong>Reason:</strong> ${reason}</div>
                            <p>Please upload a corrected version through your borrower portal at your earliest convenience.</p>
                          </div>
                          <div class="footer"><p>Powered by Lendry.AI</p></div>
                        </div>
                      </body></html>
                    `
                  });
                }
              }
            } catch (emailErr) {
              console.error('Failed to send rejection email:', emailErr);
            }
          }
        }
      }

      if (action === 'override_accept' && allFailedResolved && !anyRejected && !anyManualReview) {
        const [doc] = await db.select().from(dealDocuments).where(eq(dealDocuments.id, review.documentId));
        if (doc && doc.status !== 'approved') {
          await db.update(dealDocuments)
            .set({ status: 'approved', reviewNotes: 'All failed rules overridden and accepted' })
            .where(eq(dealDocuments.id, review.documentId));
        }
      }

      res.json({
        success: true,
        review: {
          ...review,
          findings,
          overallStatus: newOverallStatus,
        },
      });
    } catch (error: any) {
      console.error('Override finding error:', error);
      res.status(500).json({ error: 'Failed to override finding' });
    }
  });

  // Admin - Update deal stage
  // Update deal status (independent of stage)
  app.patch('/api/admin/deals/:id/status', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.id);
      const { status } = req.body;

      const validStatuses = ['active', 'closed', 'on_hold', 'archived'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
      }

      const [project] = await db.select({ id: projects.id, status: projects.status, projectName: projects.projectName })
        .from(projects)
        .where(eq(projects.id, dealId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      const oldStatus = project.status;

      await db.update(projects)
        .set({ status, lastUpdated: new Date() })
        .where(eq(projects.id, dealId));

      // Log activity
      await db.insert(projectActivity).values({
        projectId: dealId,
        activityType: 'status_change',
        title: `Status changed from ${oldStatus} to ${status}`,
        description: `Deal status updated to ${status}`,
        performedBy: req.user!.id,
        visibleToBorrower: true,
      });

      res.json({ success: true, status });
    } catch (error) {
      console.error('Update deal status error:', error);
      res.status(500).json({ error: 'Failed to update deal status' });
    }
  });

  app.patch('/api/admin/deals/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.id);
      const { stage } = req.body;

      if (!stage) {
        return res.status(400).json({ error: 'Stage is required' });
      }

      // Deal is a project - get the project and its program
      const [project] = await db.select({
        id: projects.id,
        programId: projects.programId,
        userId: projects.userId,
        currentStage: projects.currentStage,
      })
        .from(projects)
        .where(eq(projects.id, dealId))
        .limit(1);
      
      if (!project) {
        return res.status(404).json({ error: 'Deal not found' });
      }
      
      // Get the project's workflow stages
      const pStages = await db.select({
        id: projectStages.id,
        stageKey: projectStages.stageKey,
        stageName: projectStages.stageName,
        stageOrder: projectStages.stageOrder,
        status: projectStages.status,
        programStepId: projectStages.programStepId,
      })
        .from(projectStages)
        .where(eq(projectStages.projectId, dealId))
        .orderBy(asc(projectStages.stageOrder));
      
      if (pStages.length === 0) {
        return res.status(400).json({ error: 'No workflow stages found for this deal' });
      }
      
      // Find the target stage by workflow step key
      // First build a mapping from programStepId to workflow step key
      let targetStage = pStages.find(s => s.stageKey === stage);
      
      if (!targetStage && project.programId) {
        // Try to find by workflow step definition key via programStepId mapping
        const stepMappings = await db.select({
          programStepId: programWorkflowSteps.id,
          stepKey: workflowStepDefinitions.key,
        })
          .from(programWorkflowSteps)
          .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
          .where(eq(programWorkflowSteps.programId, project.programId));
        
        const keyToStepId = new Map(stepMappings.map(m => [m.stepKey, m.programStepId]));
        const targetProgramStepId = keyToStepId.get(stage);
        if (targetProgramStepId) {
          targetStage = pStages.find(s => s.programStepId === targetProgramStepId);
        }
      }
      
      if (!targetStage) {
        return res.status(400).json({ error: `Invalid stage: ${stage}` });
      }
      
      const previousStageKey = project.currentStage;
      
      // Update all project stages: completed for stages before target, in_progress for target, pending for after
      for (const ps of pStages) {
        let newStatus: string;
        if (ps.stageOrder < targetStage.stageOrder) {
          newStatus = 'completed';
        } else if (ps.id === targetStage.id) {
          newStatus = 'in_progress';
        } else {
          newStatus = 'pending';
        }
        
        const updateData: Record<string, any> = { status: newStatus };
        if (newStatus === 'in_progress' && ps.status !== 'in_progress') {
          updateData.startedAt = new Date();
        }
        if (newStatus === 'completed' && ps.status !== 'completed') {
          updateData.completedAt = new Date();
        }
        
        await db.update(projectStages)
          .set(updateData)
          .where(eq(projectStages.id, ps.id));
      }
      
      // Update project's currentStage and progressPercentage
      const completedCount = pStages.filter(s => s.stageOrder < targetStage.stageOrder).length;
      const totalStages = pStages.length;
      const progressPercentage = Math.round((completedCount / totalStages) * 100);
      
      await db.update(projects)
        .set({
          currentStage: targetStage.stageKey,
          progressPercentage,
        })
        .where(eq(projects.id, dealId));
      
      // Log activity
      try {
        await db.insert(projectActivity).values({
          projectId: dealId,
          activityType: 'stage_change',
          activityDescription: `Stage changed from "${previousStageKey || 'unknown'}" to "${targetStage.stageName}"`,
          performedBy: (req as any).user?.id || null,
          visibleToBorrower: true,
        });
      } catch (e) {
        // Non-critical, continue
      }

      try {
        await db.insert(dealMemoryEntries).values({
          dealId,
          entryType: 'stage_change',
          title: `Stage changed to: ${targetStage.stageName}`,
          description: previousStageKey ? `From "${previousStageKey}" to "${targetStage.stageName}"` : undefined,
          sourceType: 'admin',
          sourceUserId: (req as any).user?.id || null,
          metadata: { stageKey: targetStage.stageKey, stageName: targetStage.stageName, previousStageKey },
        });
      } catch (e) { console.error('Memory entry error:', e); }
      
      // Send notification if stage changed
      if (project.userId && previousStageKey !== targetStage.stageKey) {
        try {
          await postDealNotification(
            project.userId,
            dealId,
            `Deal stage updated to: ${targetStage.stageName}`
          );
        } catch (e) {
          // Non-critical
        }
      }
      
      res.json({ success: true, stage: targetStage.stageKey, stageName: targetStage.stageName });
    } catch (error) {
      console.error('Admin update deal error:', error);
      res.status(500).json({ error: 'Failed to update deal' });
    }
  });

  // Admin - Full deal update (PUT)
  app.put('/api/admin/deals/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.id);
      const {
        customerFirstName,
        customerLastName,
        customerEmail,
        customerPhone,
        propertyAddress,
        loanAmount,
        propertyValue,
        interestRate,
        loanType,
        loanPurpose,
        propertyType,
        stage,
      } = req.body;
      
      // Get current deal to preserve existing loanData
      const [existingDeal] = await db.select()
        .from(savedQuotes)
        .where(eq(savedQuotes.id, dealId))
        .limit(1);
      
      if (!existingDeal) {
        return res.status(404).json({ error: 'Deal not found' });
      }
      
      // Build updated loanData preserving fields that weren't updated
      const existingLoanData = existingDeal.loanData as Record<string, unknown> || {};
      const updatedLoanData = {
        ...existingLoanData,
        loanAmount: loanAmount ? parseFloat(loanAmount) : existingLoanData.loanAmount,
        propertyValue: propertyValue ? parseFloat(propertyValue) : existingLoanData.propertyValue,
        loanType: loanType || existingLoanData.loanType,
        loanPurpose: loanPurpose || existingLoanData.loanPurpose,
        propertyType: propertyType || existingLoanData.propertyType,
      };
      
      // Calculate LTV if we have both values
      if (updatedLoanData.loanAmount && updatedLoanData.propertyValue) {
        const ltv = ((updatedLoanData.loanAmount as number) / (updatedLoanData.propertyValue as number)) * 100;
        updatedLoanData.ltv = ltv.toFixed(2) + '%';
      }
      
      const [updated] = await db.update(savedQuotes)
        .set({
          customerFirstName: customerFirstName || existingDeal.customerFirstName,
          customerLastName: customerLastName || existingDeal.customerLastName,
          customerEmail: customerEmail || existingDeal.customerEmail,
          customerPhone: customerPhone || existingDeal.customerPhone,
          propertyAddress: propertyAddress || existingDeal.propertyAddress,
          interestRate: interestRate || existingDeal.interestRate,
          loanData: updatedLoanData,
        })
        .where(eq(savedQuotes.id, dealId))
        .returning();
      
      // Sync loanType back to the projects table
      const newLoanType = updatedLoanData.loanType as string | undefined;
      if (newLoanType && newLoanType !== 'unknown') {
        const linkedProjects = await db.select({ id: projects.id })
          .from(projects)
          .where(or(
            eq(projects.quoteId, dealId),
            eq(projects.id, dealId)
          ))
          .limit(1);
        
        if (linkedProjects.length > 0) {
          await db.update(projects)
            .set({ loanType: newLoanType })
            .where(eq(projects.id, linkedProjects[0].id));
        }
      }
      
      // Auto-populate documents if loan type changed and there are no existing documents
      const previousLoanType = existingLoanData.loanType as string | undefined;
      
      if (newLoanType && newLoanType !== 'unknown' && newLoanType !== previousLoanType) {
        // Get loan program for new loan type
        const [loanProgram] = await db.select()
          .from(loanPrograms)
          .where(and(
            eq(loanPrograms.loanType, newLoanType),
            eq(loanPrograms.isActive, true)
          ))
          .limit(1);
        
        if (loanProgram) {
          // Delete documents that haven't been uploaded yet (no file attached)
          // Keep documents with uploads (filePath is not null or status is uploaded/approved)
          await db.delete(dealDocuments)
            .where(and(
              eq(dealDocuments.dealId, dealId),
              isNull(dealDocuments.filePath),
              eq(dealDocuments.status, 'pending')
            ));
          
          // Get templates for the new loan type
          const templates = await db.select()
            .from(programDocumentTemplates)
            .where(eq(programDocumentTemplates.programId, loanProgram.id))
            .orderBy(programDocumentTemplates.sortOrder);
          
          if (templates.length > 0) {
            // Get remaining documents (ones with uploads) to avoid duplicates
            const remainingDocs = await db.select({ documentName: dealDocuments.documentName })
              .from(dealDocuments)
              .where(eq(dealDocuments.dealId, dealId));
            
            const existingDocNames = new Set(remainingDocs.map(d => d.documentName.toLowerCase()));
            
            // Only add templates that don't already exist
            const newDocuments = templates
              .filter(doc => !existingDocNames.has(doc.documentName.toLowerCase()))
              .map((doc, index) => ({
                dealId,
                documentName: doc.documentName,
                documentCategory: doc.documentCategory,
                documentDescription: doc.documentDescription,
                isRequired: doc.isRequired,
                sortOrder: doc.sortOrder || index,
                status: 'pending' as const,
              }));
            
            if (newDocuments.length > 0) {
              await db.insert(dealDocuments).values(newDocuments);
            }
          }
        }
      }
      
      res.json({ deal: updated });
    } catch (error) {
      console.error('Admin full deal update error:', error);
      res.status(500).json({ error: 'Failed to update deal' });
    }
  });

  // Admin - Populate deal documents from loan program templates
  app.post('/api/admin/deals/:dealId/populate-documents', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const { programId: bodyProgramId, clearExisting } = req.body;
      
      // Look up the project to find its programId
      const [project] = await db.select({ programId: projects.programId })
        .from(projects)
        .where(eq(projects.id, dealId))
        .limit(1);
      
      const resolvedProgramId = bodyProgramId || project?.programId;
      
      if (!resolvedProgramId) {
        return res.status(400).json({ error: 'No loan program associated with this deal. Please set a program first.' });
      }
      
      const [loanProgram] = await db.select()
        .from(loanPrograms)
        .where(eq(loanPrograms.id, resolvedProgramId))
        .limit(1);
      
      if (!loanProgram) {
        return res.status(404).json({ error: 'Loan program not found' });
      }
      
      const templates = await db.select()
        .from(programDocumentTemplates)
        .where(eq(programDocumentTemplates.programId, loanProgram.id))
        .orderBy(programDocumentTemplates.sortOrder);
      
      if (templates.length === 0) {
        return res.json({ 
          message: 'No document templates found for this loan program',
          documentsCreated: 0
        });
      }
      
      if (clearExisting) {
        await db.delete(dealDocuments)
          .where(and(
            eq(dealDocuments.dealId, dealId),
            eq(dealDocuments.status, 'pending')
          ));
      }
      
      const createdDocs = [];
      for (const template of templates) {
        const [existing] = await db.select()
          .from(dealDocuments)
          .where(and(
            eq(dealDocuments.dealId, dealId),
            eq(dealDocuments.documentName, template.documentName)
          ))
          .limit(1);
        
        if (!existing) {
          const [doc] = await db.insert(dealDocuments)
            .values({
              dealId,
              documentName: template.documentName,
              documentCategory: template.documentCategory,
              documentDescription: template.documentDescription,
              isRequired: template.isRequired,
              sortOrder: template.sortOrder,
              status: 'pending',
            })
            .returning();
          createdDocs.push(doc);
        }
      }
      
      res.json({ 
        message: `Successfully populated ${createdDocs.length} documents from ${loanProgram.name} templates`,
        documentsCreated: createdDocs.length,
        documents: createdDocs
      });
    } catch (error) {
      console.error('Populate deal documents error:', error);
      res.status(500).json({ error: 'Failed to populate documents' });
    }
  });

  // Admin - Get deal tasks
  app.get('/api/admin/deals/:dealId/tasks', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      
      const tasks = await db.select({
        id: dealTasks.id,
        dealId: dealTasks.dealId,
        taskName: dealTasks.taskName,
        taskDescription: dealTasks.taskDescription,
        status: dealTasks.status,
        priority: dealTasks.priority,
        assignedTo: dealTasks.assignedTo,
        assigneeName: users.fullName,
        assigneeEmail: users.email,
        dueDate: dealTasks.dueDate,
        completedAt: dealTasks.completedAt,
        createdAt: dealTasks.createdAt,
      })
        .from(dealTasks)
        .leftJoin(users, eq(dealTasks.assignedTo, users.id))
        .where(eq(dealTasks.dealId, dealId))
        .orderBy(dealTasks.createdAt);
      
      res.json({ tasks });
    } catch (error) {
      console.error('Admin get deal tasks error:', error);
      res.status(500).json({ error: 'Failed to load tasks' });
    }
  });

  // Admin - Create deal task
  app.post('/api/admin/deals/:dealId/tasks', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const { taskName, taskDescription, priority, assignedTo, dueDate } = req.body;
      
      const [task] = await db.insert(dealTasks)
        .values({
          dealId,
          taskName,
          taskDescription,
          priority: priority || 'medium',
          assignedTo: assignedTo ? parseInt(assignedTo) : null,
          dueDate: dueDate ? new Date(dueDate) : null,
          createdBy: req.user!.id,
        })
        .returning();
      
      res.json({ task });
    } catch (error) {
      console.error('Admin create deal task error:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  // Admin - Update deal task
  app.patch('/api/admin/deals/:dealId/tasks/:taskId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const taskId = parseInt(req.params.taskId);
      const { status, taskName, taskDescription, priority, assignedTo, dueDate } = req.body;
      
      // Get current task status to detect completion
      const [existingTask] = await db.select().from(dealTasks).where(eq(dealTasks.id, taskId)).limit(1);
      const wasCompleted = existingTask?.status === 'completed';
      
      const updateData: Record<string, unknown> = {};
      if (status !== undefined) updateData.status = status;
      if (taskName !== undefined) updateData.taskName = taskName;
      if (taskDescription !== undefined) updateData.taskDescription = taskDescription;
      if (priority !== undefined) updateData.priority = priority;
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo ? parseInt(assignedTo) : null;
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
      
      if (status === 'completed') {
        updateData.completedAt = new Date();
        updateData.completedBy = req.user!.id;
      }
      
      const [updated] = await db.update(dealTasks)
        .set(updateData)
        .where(eq(dealTasks.id, taskId))
        .returning();

      if (assignedTo !== undefined && assignedTo) {
        const assigneeId = parseInt(assignedTo);
        if (!isNaN(assigneeId) && assigneeId !== req.user!.id && assigneeId !== existingTask?.assignedTo) {
          const assignerName = req.user!.fullName || req.user!.email || 'Someone';
          const taskLabel = updated.taskName || 'a task';
          const taskProj = await db.select({ loanNumber: projects.loanNumber }).from(projects).where(eq(projects.id, dealId)).limit(1);
          const taskDealLabel = taskProj[0]?.loanNumber || `DEAL-${dealId}`;
          await createNotification({
            userId: assigneeId,
            type: 'task_assigned',
            title: 'Task Assigned',
            message: `${assignerName} assigned you "${taskLabel}" on ${taskDealLabel}`,
            dealId,
            link: `/admin/deals/${dealId}`,
          });
        }
      }

      // Send notification if task was just completed
      if (status === 'completed' && !wasCompleted) {
        const deal = await db.select({ userId: savedQuotes.userId })
          .from(savedQuotes).where(eq(savedQuotes.id, dealId)).limit(1);
        if (deal[0]?.userId) {
          await postDealNotification(
            deal[0].userId,
            dealId,
            `✅ Task completed: ${updated.taskName || 'Task'}`
          );
        }
      }
      
      res.json({ task: updated });
    } catch (error) {
      console.error('Admin update deal task error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  // Admin - Delete deal task
  app.delete('/api/admin/deals/:dealId/tasks/:taskId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId);
      
      await db.delete(dealTasks).where(eq(dealTasks.id, taskId));
      
      res.json({ success: true });
    } catch (error) {
      console.error('Admin delete deal task error:', error);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  // Admin - Create deal document manually
  app.post('/api/admin/deals/:dealId/documents', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const { documentName, documentCategory, documentDescription, isRequired, stageId } = req.body;

      let validatedStageId: number | undefined;
      if (stageId) {
        const stage = await storage.getStageById(parseInt(stageId));
        if (!stage) {
          return res.status(400).json({ error: 'Invalid stage' });
        }
        validatedStageId = stage.id;
      }
      
      // Get max sort order
      const existing = await db.select({ maxOrder: dealDocuments.sortOrder })
        .from(dealDocuments)
        .where(eq(dealDocuments.dealId, dealId))
        .orderBy(dealDocuments.sortOrder);
      
      const maxOrder = existing.length > 0 ? Math.max(...existing.map(d => d.maxOrder || 0)) : 0;
      
      const [doc] = await db.insert(dealDocuments)
        .values({
          dealId,
          documentName,
          documentCategory: documentCategory || 'other',
          documentDescription,
          isRequired: isRequired !== false,
          sortOrder: maxOrder + 1,
          ...(validatedStageId ? { stageId: validatedStageId } : {}),
        })
        .returning();
      
      res.json({ document: doc });
    } catch (error) {
      console.error('Admin create deal document error:', error);
      res.status(500).json({ error: 'Failed to create document' });
    }
  });

  // Admin - Get admin users (for task assignment)
  app.get('/api/admin/team-members', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const teamMembers = await db.select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
      })
        .from(users)
        .where(inArray(users.role, ['admin', 'staff', 'super_admin']));
      
      res.json({ teamMembers });
    } catch (error) {
      console.error('Admin get team members error:', error);
      res.status(500).json({ error: 'Failed to load team members' });
    }
  });

  // ==================== PARTNERS ROUTES ====================
  
  // Get all partners
  app.get('/api/admin/partners', authenticateUser, requireAdmin, requirePermission('partners.view'), async (req: AuthRequest, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      
      let partnersList = await db.select().from(partners).orderBy(desc(partners.createdAt));
      
      if (search) {
        const searchLower = search.toLowerCase();
        partnersList = partnersList.filter(p => 
          p.name.toLowerCase().includes(searchLower) ||
          p.companyName?.toLowerCase().includes(searchLower) ||
          p.email?.toLowerCase().includes(searchLower) ||
          p.phone?.includes(search)
        );
      }
      
      // Get loan counts for each partner
      const partnersWithStats = await Promise.all(partnersList.map(async (partner) => {
        const deals = await db.select().from(savedQuotes).where(eq(savedQuotes.partnerId, partner.id));
        const activeDeals = deals.filter(d => !['closed', 'voided', 'cancelled'].includes(d.stage));
        return {
          ...partner,
          loansInProcess: activeDeals.length,
          allTimeLoans: deals.length,
        };
      }));
      
      res.json({ partners: partnersWithStats });
    } catch (error) {
      console.error('Get partners error:', error);
      res.status(500).json({ error: 'Failed to load partners' });
    }
  });
  
  // Get partner by ID
  app.get('/api/admin/partners/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const partner = await db.select().from(partners).where(eq(partners.id, parseInt(id))).limit(1);
      
      if (!partner.length) {
        return res.status(404).json({ error: 'Partner not found' });
      }
      
      // Get associated deals
      const deals = await db.select().from(savedQuotes).where(eq(savedQuotes.partnerId, parseInt(id)));
      
      res.json({ partner: partner[0], deals });
    } catch (error) {
      console.error('Get partner error:', error);
      res.status(500).json({ error: 'Failed to load partner' });
    }
  });
  
  // Create new partner
  app.post('/api/admin/partners', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, companyName, email, phone, entityType, experienceLevel, notes } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Partner name is required' });
      }
      
      const [newPartner] = await db.insert(partners).values({
        name,
        companyName: companyName || null,
        email: email || null,
        phone: phone || null,
        entityType: entityType || null,
        experienceLevel: experienceLevel || 'beginner',
        notes: notes || null,
        isActive: true,
      }).returning();
      
      res.json({ partner: newPartner });
    } catch (error) {
      console.error('Create partner error:', error);
      res.status(500).json({ error: 'Failed to create partner' });
    }
  });
  
  // Update partner
  app.put('/api/admin/partners/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, companyName, email, phone, entityType, experienceLevel, notes, isActive } = req.body;
      
      const [updated] = await db.update(partners)
        .set({
          name,
          companyName,
          email,
          phone,
          entityType,
          experienceLevel,
          notes,
          isActive,
        })
        .where(eq(partners.id, parseInt(id)))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Partner not found' });
      }
      
      res.json({ partner: updated });
    } catch (error) {
      console.error('Update partner error:', error);
      res.status(500).json({ error: 'Failed to update partner' });
    }
  });
  
  // Delete partner
  app.delete('/api/admin/partners/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      await db.delete(partners).where(eq(partners.id, parseInt(id)));
      
      res.json({ success: true });
    } catch (error) {
      console.error('Delete partner error:', error);
      res.status(500).json({ error: 'Failed to delete partner' });
    }
  });

  // ==================== PARTNER BROADCAST ROUTES ====================
  
  // Send a broadcast to all partners
  app.post('/api/admin/broadcasts', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { subject, emailBody, smsBody, sendEmail, sendSms: sendSmsFlag } = req.body;
      
      // Validate based on what's being sent
      const willSendEmail = sendEmail !== false;
      const willSendSms = sendSmsFlag === true;
      
      if (!subject) {
        return res.status(400).json({ error: 'Subject is required' });
      }
      
      if (willSendEmail && !emailBody) {
        return res.status(400).json({ error: 'Email body is required when sending email' });
      }
      
      if (willSendSms && !smsBody) {
        return res.status(400).json({ error: 'SMS body is required when sending SMS' });
      }
      
      if (!willSendEmail && !willSendSms) {
        return res.status(400).json({ error: 'At least one delivery method (email or SMS) must be selected' });
      }
      
      // Create the broadcast record
      const [broadcast] = await db.insert(partnerBroadcasts).values({
        sentBy: req.user!.id,
        subject,
        emailBody,
        smsBody: smsBody || null,
        sendEmail: sendEmail !== false,
        sendSms: sendSmsFlag || false,
      }).returning();
      
      // Send the broadcast asynchronously
      sendPartnerBroadcast(
        broadcast.id,
        subject,
        emailBody,
        smsBody || null,
        sendEmail !== false,
        sendSmsFlag || false,
        req.user!.id
      ).then(result => {
        console.log('Broadcast completed:', result);
      }).catch(error => {
        console.error('Broadcast failed:', error);
      });
      
      res.json({ 
        success: true, 
        broadcast: { id: broadcast.id },
        message: 'Broadcast started. Messages are being sent in the background.'
      });
    } catch (error) {
      console.error('Create broadcast error:', error);
      res.status(500).json({ error: 'Failed to create broadcast' });
    }
  });
  
  // Get broadcast history
  app.get('/api/admin/broadcasts', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const broadcasts = await getBroadcastHistory(50);
      res.json({ broadcasts });
    } catch (error) {
      console.error('Get broadcasts error:', error);
      res.status(500).json({ error: 'Failed to load broadcasts' });
    }
  });
  
  // Get single broadcast with recipients
  app.get('/api/admin/broadcasts/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const [broadcast] = await db.select().from(partnerBroadcasts).where(eq(partnerBroadcasts.id, parseInt(id)));
      if (!broadcast) {
        return res.status(404).json({ error: 'Broadcast not found' });
      }
      
      const recipients = await db.select().from(partnerBroadcastRecipients)
        .where(eq(partnerBroadcastRecipients.broadcastId, parseInt(id)));
      
      res.json({ broadcast, recipients });
    } catch (error) {
      console.error('Get broadcast error:', error);
      res.status(500).json({ error: 'Failed to load broadcast' });
    }
  });
  
  // Get inbound SMS messages (for admin inbox)
  app.get('/api/admin/sms-inbox', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { unreadOnly, partnerId } = req.query;
      
      const messages = await getInboundMessages({
        unreadOnly: unreadOnly === 'true',
        partnerId: partnerId ? parseInt(partnerId as string) : undefined,
        limit: 100
      });
      
      res.json({ messages });
    } catch (error) {
      console.error('Get inbox error:', error);
      res.status(500).json({ error: 'Failed to load inbox' });
    }
  });
  
  // Get unread SMS count for notifications
  app.get('/api/admin/sms-inbox/unread-count', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const result = await db.select({ count: sql<number>`count(*)::int` })
        .from(inboundSmsMessages)
        .where(eq(inboundSmsMessages.isRead, false));
      
      res.json({ unreadCount: result[0]?.count || 0 });
    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  });
  
  // Mark SMS message as read
  app.post('/api/admin/sms-inbox/:id/read', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await markMessageRead(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error('Mark read error:', error);
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });
  
  // Twilio webhook for incoming SMS
  app.post('/api/webhooks/twilio/sms', async (req: Request, res: Response) => {
    try {
      const { From, To, Body, MessageSid } = req.body;
      
      if (!From || !Body) {
        return res.status(400).send('Missing required fields');
      }
      
      await handleIncomingSms(From, To || '', Body, MessageSid || '');
      
      // Return TwiML response (empty to not send a reply)
      res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error) {
      console.error('Twilio webhook error:', error);
      res.status(500).send('Webhook processing failed');
    }
  });

  // ==================== LOAN PROGRAMS ROUTES ====================
  
  // Get all loan programs with their document and task templates
  app.get('/api/admin/programs', authenticateUser, requireAdmin, requirePermission('programs.view'), async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.user!.id);
      const isSuperAdmin = user?.role === 'super_admin';
      const programs = await db.select().from(loanPrograms)
        .where(isSuperAdmin ? undefined : eq(loanPrograms.createdBy, req.user!.id))
        .orderBy(loanPrograms.sortOrder);
      
      // Get document and task counts for each program
      const programsWithCounts = await Promise.all(programs.map(async (program) => {
        const docs = await db.select().from(programDocumentTemplates).where(eq(programDocumentTemplates.programId, program.id));
        const tasks = await db.select().from(programTaskTemplates).where(eq(programTaskTemplates.programId, program.id));
        
        return {
          ...program,
          documentCount: docs.length,
          taskCount: tasks.length,
        };
      }));
      
      res.json(programsWithCounts);
    } catch (error) {
      console.error('Get programs error:', error);
      res.status(500).json({ error: 'Failed to load programs' });
    }
  });
  
  // Get single program with documents and tasks
  app.get('/api/admin/programs/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, parseInt(id)));
      
      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }
      
      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && program.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to view this program' });
      }
      
      const documents = await db.select().from(programDocumentTemplates)
        .where(eq(programDocumentTemplates.programId, program.id))
        .orderBy(programDocumentTemplates.sortOrder);
      
      const tasks = await db.select().from(programTaskTemplates)
        .where(eq(programTaskTemplates.programId, program.id))
        .orderBy(programTaskTemplates.sortOrder);

      const workflowSteps = await db.select({
        id: programWorkflowSteps.id,
        programId: programWorkflowSteps.programId,
        stepDefinitionId: programWorkflowSteps.stepDefinitionId,
        stepOrder: programWorkflowSteps.stepOrder,
        isRequired: programWorkflowSteps.isRequired,
        estimatedDays: programWorkflowSteps.estimatedDays,
        createdAt: programWorkflowSteps.createdAt,
        definition: {
          id: workflowStepDefinitions.id,
          name: workflowStepDefinitions.name,
          key: workflowStepDefinitions.key,
          description: workflowStepDefinitions.description,
          color: workflowStepDefinitions.color,
          icon: workflowStepDefinitions.icon,
        }
      })
        .from(programWorkflowSteps)
        .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
        .where(eq(programWorkflowSteps.programId, program.id))
        .orderBy(programWorkflowSteps.stepOrder);
      
      res.json({ program, documents, tasks, workflowSteps });
    } catch (error) {
      console.error('Get program error:', error);
      res.status(500).json({ error: 'Failed to load program' });
    }
  });
  
  // Create loan program
  app.post('/api/admin/programs', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const {
        name, description, loanType,
        minLoanAmount, maxLoanAmount,
        minLtv, maxLtv,
        minInterestRate, maxInterestRate,
        termOptions, eligiblePropertyTypes,
        isActive,
        documents,
        tasks,
        steps,
        creditPolicyId,
        // YSP configuration
        yspEnabled, yspBrokerCanToggle, yspFixedAmount,
        yspMin, yspMax, yspStep,
        // Points configuration
        basePoints, basePointsMin, basePointsMax,
        brokerPointsEnabled, brokerPointsMax, brokerPointsStep,
      } = req.body;

      if (!name || !loanType) {
        return res.status(400).json({ error: 'Name and loan type are required' });
      }

      const result = await db.transaction(async (tx) => {
        const [program] = await tx.insert(loanPrograms).values({
          name,
          description,
          loanType,
          minLoanAmount: minLoanAmount ? parseFloat(minLoanAmount) : 100000,
          maxLoanAmount: maxLoanAmount ? parseFloat(maxLoanAmount) : 5000000,
          minLtv: minLtv ? parseFloat(minLtv) : 50,
          maxLtv: maxLtv ? parseFloat(maxLtv) : 80,
          minInterestRate: minInterestRate ? parseFloat(minInterestRate) : 8,
          maxInterestRate: maxInterestRate ? parseFloat(maxInterestRate) : 15,
          termOptions,
          eligiblePropertyTypes: eligiblePropertyTypes || [],
          isActive: isActive !== false,
          creditPolicyId: creditPolicyId ? parseInt(creditPolicyId) : null,
          createdBy: req.user!.id,
          // YSP configuration
          yspEnabled: yspEnabled === true,
          yspBrokerCanToggle: yspBrokerCanToggle === true,
          yspFixedAmount: yspFixedAmount != null ? parseFloat(yspFixedAmount) : 0,
          yspMin: yspMin != null ? parseFloat(yspMin) : 0,
          yspMax: yspMax != null ? parseFloat(yspMax) : 3,
          yspStep: yspStep != null ? parseFloat(yspStep) : 0.125,
          // Points configuration
          basePoints: basePoints != null ? parseFloat(basePoints) : 1,
          basePointsMin: basePointsMin != null ? parseFloat(basePointsMin) : 0.5,
          basePointsMax: basePointsMax != null ? parseFloat(basePointsMax) : 3,
          brokerPointsEnabled: brokerPointsEnabled !== false,
          brokerPointsMax: brokerPointsMax != null ? parseFloat(brokerPointsMax) : 2,
          brokerPointsStep: brokerPointsStep != null ? parseFloat(brokerPointsStep) : 0.125,
        }).returning();

        const stepIndexToId = new Map<number, number>();
        if (steps && Array.isArray(steps) && steps.length > 0) {
          const validSteps = steps.filter((s: any) => s.stepName?.trim() || s.stepDefinitionId);
          if (validSteps.length > 0) {
            const stepEntries = validSteps.map((step: any, index: number) => ({
              programId: program.id,
              stepDefinitionId: step.stepDefinitionId,
              stepOrder: index + 1,
              isRequired: step.isRequired !== false,
              estimatedDays: step.estimatedDays || null,
            }));
            const insertedSteps = await tx.insert(programWorkflowSteps).values(stepEntries).returning();
            insertedSteps.forEach((row, idx) => {
              stepIndexToId.set(idx, row.id);
            });
          }
        }
        
        if (documents && Array.isArray(documents) && documents.length > 0) {
          const validDocs = documents.filter((doc: any) => doc.documentName?.trim());
          if (validDocs.length > 0) {
            const documentEntries = validDocs.map((doc: any, index: number) => ({
              programId: program.id,
              documentName: doc.documentName.trim(),
              documentCategory: doc.documentCategory || 'other',
              documentDescription: doc.documentDescription || null,
              isRequired: doc.isRequired !== false,
              assignedTo: doc.assignedTo || 'borrower',
              visibility: doc.visibility || 'all',
              sortOrder: index,
              stepId: doc.stepIndex != null ? (stepIndexToId.get(doc.stepIndex) ?? null) : null,
            }));
            await tx.insert(programDocumentTemplates).values(documentEntries);
          }
        }
        
        if (tasks && Array.isArray(tasks) && tasks.length > 0) {
          const validTasks = tasks.filter((task: any) => task.taskName?.trim());
          if (validTasks.length > 0) {
            const taskEntries = validTasks.map((task: any, index: number) => ({
              programId: program.id,
              taskName: task.taskName.trim(),
              taskDescription: task.taskDescription || null,
              taskCategory: task.taskCategory || 'other',
              priority: task.priority || 'medium',
              assignToRole: task.assignedTo || 'admin',
              visibility: task.visibility || 'all',
              sortOrder: index,
              stepId: task.stepIndex != null ? (stepIndexToId.get(task.stepIndex) ?? null) : null,
            }));
            await tx.insert(programTaskTemplates).values(taskEntries);
          }
        }
        
        return program;
      });
      
      res.json({ program: result });
    } catch (error) {
      console.error('Create program error:', error);
      res.status(500).json({ error: 'Failed to create program' });
    }
  });
  
  // Update loan program
  app.put('/api/admin/programs/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const pid = parseInt(id);
      
      const [existingProgram] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, pid));
      if (!existingProgram) return res.status(404).json({ error: 'Program not found' });
      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && existingProgram.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to modify this program' });
      }
      
      const {
        name, description, loanType,
        minLoanAmount, maxLoanAmount,
        minLtv, maxLtv,
        minInterestRate, maxInterestRate,
        termOptions, eligiblePropertyTypes,
        isActive, reviewGuidelines, creditPolicyId,
        documents, tasks, steps,
        // YSP configuration
        yspEnabled, yspBrokerCanToggle, yspFixedAmount,
        yspMin, yspMax, yspStep,
        // Points configuration
        basePoints, basePointsMin, basePointsMax,
        brokerPointsEnabled, brokerPointsMax, brokerPointsStep,
      } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (loanType !== undefined) updateData.loanType = loanType;
      if (minLoanAmount !== undefined) updateData.minLoanAmount = parseFloat(minLoanAmount);
      if (maxLoanAmount !== undefined) updateData.maxLoanAmount = parseFloat(maxLoanAmount);
      if (minLtv !== undefined) updateData.minLtv = parseFloat(minLtv);
      if (maxLtv !== undefined) updateData.maxLtv = parseFloat(maxLtv);
      if (minInterestRate !== undefined) updateData.minInterestRate = parseFloat(minInterestRate);
      if (maxInterestRate !== undefined) updateData.maxInterestRate = parseFloat(maxInterestRate);
      if (termOptions !== undefined) updateData.termOptions = termOptions;
      if (eligiblePropertyTypes !== undefined) updateData.eligiblePropertyTypes = eligiblePropertyTypes;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (reviewGuidelines !== undefined) updateData.reviewGuidelines = reviewGuidelines;
      if (creditPolicyId !== undefined) updateData.creditPolicyId = creditPolicyId ? parseInt(creditPolicyId) : null;
      // YSP configuration
      if (yspEnabled !== undefined) updateData.yspEnabled = yspEnabled === true;
      if (yspBrokerCanToggle !== undefined) updateData.yspBrokerCanToggle = yspBrokerCanToggle === true;
      if (yspFixedAmount !== undefined) updateData.yspFixedAmount = parseFloat(yspFixedAmount) || 0;
      if (yspMin !== undefined) updateData.yspMin = parseFloat(yspMin) || 0;
      if (yspMax !== undefined) updateData.yspMax = parseFloat(yspMax) || 3;
      if (yspStep !== undefined) updateData.yspStep = parseFloat(yspStep) || 0.125;
      // Points configuration
      if (basePoints !== undefined) updateData.basePoints = parseFloat(basePoints) || 1;
      if (basePointsMin !== undefined) updateData.basePointsMin = parseFloat(basePointsMin) || 0.5;
      if (basePointsMax !== undefined) updateData.basePointsMax = parseFloat(basePointsMax) || 3;
      if (brokerPointsEnabled !== undefined) updateData.brokerPointsEnabled = brokerPointsEnabled !== false;
      if (brokerPointsMax !== undefined) updateData.brokerPointsMax = parseFloat(brokerPointsMax) || 2;
      if (brokerPointsStep !== undefined) updateData.brokerPointsStep = parseFloat(brokerPointsStep) || 0.125;
      
      await db.transaction(async (tx) => {
        await tx.update(loanPrograms)
          .set(updateData)
          .where(eq(loanPrograms.id, pid));

        if (steps !== undefined && Array.isArray(steps)) {
          await tx.delete(programWorkflowSteps).where(eq(programWorkflowSteps.programId, pid));
          if (steps.length > 0) {
            const stepEntries = steps.map((step: any, index: number) => ({
              programId: pid,
              stepDefinitionId: step.stepDefinitionId,
              stepOrder: index + 1,
              isRequired: step.isRequired !== false,
              estimatedDays: step.estimatedDays || null,
            }));
            await tx.insert(programWorkflowSteps).values(stepEntries);
          }
        }

        const newStepRows = await tx.select({
          id: programWorkflowSteps.id,
          stepDefinitionId: programWorkflowSteps.stepDefinitionId,
          stepOrder: programWorkflowSteps.stepOrder,
        }).from(programWorkflowSteps).where(eq(programWorkflowSteps.programId, pid)).orderBy(asc(programWorkflowSteps.stepOrder));

        const stepIndexToId = new Map<number, number>();
        newStepRows.forEach((row, idx) => {
          stepIndexToId.set(idx, row.id);
        });

        if (documents !== undefined && Array.isArray(documents)) {
          await tx.delete(programDocumentTemplates).where(eq(programDocumentTemplates.programId, pid));
          const validDocs = documents.filter((doc: any) => doc.documentName?.trim());
          if (validDocs.length > 0) {
            const docEntries = validDocs.map((doc: any, index: number) => ({
              programId: pid,
              documentName: doc.documentName.trim(),
              documentCategory: doc.documentCategory || 'other',
              documentDescription: doc.documentDescription || null,
              isRequired: doc.isRequired !== false,
              assignedTo: doc.assignedTo || 'borrower',
              visibility: doc.visibility || 'all',
              sortOrder: index,
              stepId: doc.stepIndex != null ? (stepIndexToId.get(doc.stepIndex) ?? null) : null,
            }));
            await tx.insert(programDocumentTemplates).values(docEntries);
          }
        }

        if (tasks !== undefined && Array.isArray(tasks)) {
          await tx.delete(programTaskTemplates).where(eq(programTaskTemplates.programId, pid));
          const validTasks = tasks.filter((task: any) => task.taskName?.trim());
          if (validTasks.length > 0) {
            const taskEntries = validTasks.map((task: any, index: number) => ({
              programId: pid,
              taskName: task.taskName.trim(),
              taskDescription: task.taskDescription || null,
              taskCategory: task.taskCategory || 'other',
              priority: task.priority || 'medium',
              assignToRole: task.assignedTo || 'admin',
              visibility: task.visibility || 'all',
              sortOrder: index,
              stepId: task.stepIndex != null ? (stepIndexToId.get(task.stepIndex) ?? null) : null,
            }));
            await tx.insert(programTaskTemplates).values(taskEntries);
          }
        }
      });

      const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, pid));
      
      res.json({ program });
    } catch (error) {
      console.error('Update program error:', error);
      res.status(500).json({ error: 'Failed to update program' });
    }
  });
  
  // Toggle program active status
  app.patch('/api/admin/programs/:id/toggle', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, parseInt(id)));
      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }
      
      const [updated] = await db.update(loanPrograms)
        .set({ isActive: !program.isActive, updatedAt: new Date() })
        .where(eq(loanPrograms.id, parseInt(id)))
        .returning();
      
      res.json({ program: updated });
    } catch (error) {
      console.error('Toggle program error:', error);
      res.status(500).json({ error: 'Failed to toggle program' });
    }
  });
  
  // Toggle program template status
  app.patch('/api/admin/programs/:id/template', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const pid = parseInt(req.params.id);
      const [program] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, pid));
      if (!program) return res.status(404).json({ error: 'Program not found' });
      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && program.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      const [updated] = await db.update(loanPrograms)
        .set({ isTemplate: !program.isTemplate, updatedAt: new Date() })
        .where(eq(loanPrograms.id, pid))
        .returning();
      res.json({ program: updated });
    } catch (error) {
      console.error('Toggle template error:', error);
      res.status(500).json({ error: 'Failed to toggle template status' });
    }
  });

  // Duplicate a program with all stages, documents, and tasks
  app.post('/api/admin/programs/:id/duplicate', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const pid = parseInt(req.params.id);
      const [source] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, pid));
      if (!source) return res.status(404).json({ error: 'Program not found' });
      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && source.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const result = await db.transaction(async (tx) => {
        const [newProgram] = await tx.insert(loanPrograms).values({
          name: `${source.name} (Copy)`,
          description: source.description,
          loanType: source.loanType,
          minLoanAmount: source.minLoanAmount,
          maxLoanAmount: source.maxLoanAmount,
          minLtv: source.minLtv,
          maxLtv: source.maxLtv,
          minInterestRate: source.minInterestRate,
          maxInterestRate: source.maxInterestRate,
          minUnits: source.minUnits,
          maxUnits: source.maxUnits,
          termOptions: source.termOptions,
          eligiblePropertyTypes: source.eligiblePropertyTypes,
          isActive: false,
          isTemplate: false,
          sortOrder: source.sortOrder,
          reviewGuidelines: source.reviewGuidelines,
          creditPolicyId: source.creditPolicyId,
          createdBy: req.user!.id,
        }).returning();

        const oldSteps = await tx.select().from(programWorkflowSteps)
          .where(eq(programWorkflowSteps.programId, pid))
          .orderBy(programWorkflowSteps.stepOrder);
        const oldStepIdToNewId = new Map<number, number>();
        for (const step of oldSteps) {
          const [newStep] = await tx.insert(programWorkflowSteps).values({
            programId: newProgram.id,
            stepDefinitionId: step.stepDefinitionId,
            stepOrder: step.stepOrder,
            isRequired: step.isRequired,
            estimatedDays: step.estimatedDays,
          }).returning();
          oldStepIdToNewId.set(step.id, newStep.id);
        }

        const oldDocs = await tx.select().from(programDocumentTemplates)
          .where(eq(programDocumentTemplates.programId, pid))
          .orderBy(programDocumentTemplates.sortOrder);
        if (oldDocs.length > 0) {
          await tx.insert(programDocumentTemplates).values(
            oldDocs.map(doc => ({
              programId: newProgram.id,
              documentName: doc.documentName,
              documentCategory: doc.documentCategory,
              documentDescription: doc.documentDescription,
              isRequired: doc.isRequired,
              assignedTo: doc.assignedTo,
              visibility: doc.visibility,
              sortOrder: doc.sortOrder,
              stepId: doc.stepId ? (oldStepIdToNewId.get(doc.stepId) ?? null) : null,
            }))
          );
        }

        const oldTasks = await tx.select().from(programTaskTemplates)
          .where(eq(programTaskTemplates.programId, pid))
          .orderBy(programTaskTemplates.sortOrder);
        if (oldTasks.length > 0) {
          await tx.insert(programTaskTemplates).values(
            oldTasks.map(task => ({
              programId: newProgram.id,
              taskName: task.taskName,
              taskDescription: task.taskDescription,
              taskCategory: task.taskCategory,
              priority: task.priority,
              assignToRole: task.assignToRole,
              visibility: task.visibility,
              sortOrder: task.sortOrder,
              stepId: task.stepId ? (oldStepIdToNewId.get(task.stepId) ?? null) : null,
            }))
          );
        }

        return newProgram;
      });

      res.json({ program: result });
    } catch (error) {
      console.error('Duplicate program error:', error);
      res.status(500).json({ error: 'Failed to duplicate program' });
    }
  });

  // Delete loan program
  app.delete('/api/admin/programs/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const [existingProgram] = await db.select().from(loanPrograms).where(eq(loanPrograms.id, parseInt(id)));
      if (!existingProgram) return res.status(404).json({ error: 'Program not found' });
      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && existingProgram.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to delete this program' });
      }
      
      await db.delete(loanPrograms).where(eq(loanPrograms.id, parseInt(id)));
      
      res.json({ success: true });
    } catch (error) {
      console.error('Delete program error:', error);
      res.status(500).json({ error: 'Failed to delete program' });
    }
  });
  
  // ==================== PROGRAM DOCUMENT TEMPLATES ROUTES ====================
  
  // Add document template to program
  app.post('/api/admin/programs/:programId/documents', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      const { documentName, documentCategory, documentDescription, isRequired, sortOrder, stepId, stepDefinitionId, assignedTo, visibility } = req.body;
      
      if (!documentName || !documentCategory) {
        return res.status(400).json({ error: 'Document name and category are required' });
      }

      let resolvedStepId = stepId || null;
      if (!resolvedStepId && stepDefinitionId) {
        const pid = parseInt(programId);
        const existing = await db.select({ id: programWorkflowSteps.id })
          .from(programWorkflowSteps)
          .where(and(eq(programWorkflowSteps.programId, pid), eq(programWorkflowSteps.stepDefinitionId, stepDefinitionId)))
          .limit(1);
        if (existing.length > 0) {
          resolvedStepId = existing[0].id;
        } else {
          const maxOrder = await db.select({ max: sql<number>`COALESCE(MAX(${programWorkflowSteps.stepOrder}), 0)` })
            .from(programWorkflowSteps)
            .where(eq(programWorkflowSteps.programId, pid));
          const [newStep] = await db.insert(programWorkflowSteps).values({
            programId: pid,
            stepDefinitionId,
            stepOrder: (maxOrder[0]?.max || 0) + 1,
            isRequired: true,
          }).returning();
          resolvedStepId = newStep.id;
        }
      }
      
      const [doc] = await db.insert(programDocumentTemplates).values({
        programId: parseInt(programId),
        documentName,
        documentCategory,
        documentDescription,
        isRequired: isRequired !== false,
        assignedTo: assignedTo || 'borrower',
        visibility: visibility || 'all',
        sortOrder: sortOrder || 0,
        stepId: resolvedStepId,
      }).returning();
      
      res.json({ document: doc });
      const { syncProgramToProjects } = await import('./services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Add program document error:', error);
      res.status(500).json({ error: 'Failed to add document template' });
    }
  });
  
  // Batch update document step assignments (MUST be before :docId route)
  app.put('/api/admin/programs/:programId/documents/batch-step', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { assignments } = req.body;
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ error: 'Assignments must be an array' });
      }
      await db.transaction(async (tx) => {
        for (const assignment of assignments) {
          await tx.update(programDocumentTemplates)
            .set({ stepId: assignment.stepId ?? null })
            .where(eq(programDocumentTemplates.id, assignment.documentId));
        }
      });
      res.json({ success: true });
      const { programId } = req.params;
      const { syncProgramToProjects } = await import('./services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Batch update document steps error:', error);
      res.status(500).json({ error: 'Failed to update document assignments' });
    }
  });

  // Update document template
  app.put('/api/admin/programs/:programId/documents/:docId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { docId } = req.params;
      const { documentName, documentCategory, documentDescription, isRequired, sortOrder, stepId } = req.body;
      
      const updateData: any = {};
      if (documentName !== undefined) updateData.documentName = documentName;
      if (documentCategory !== undefined) updateData.documentCategory = documentCategory;
      if (documentDescription !== undefined) updateData.documentDescription = documentDescription;
      if (isRequired !== undefined) updateData.isRequired = isRequired;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (stepId !== undefined) updateData.stepId = stepId;
      
      const [doc] = await db.update(programDocumentTemplates)
        .set(updateData)
        .where(eq(programDocumentTemplates.id, parseInt(docId)))
        .returning();
      
      res.json({ document: doc });
      const { syncProgramToProjects } = await import('./services/projectPipeline');
      syncProgramToProjects(parseInt(req.params.programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Update program document error:', error);
      res.status(500).json({ error: 'Failed to update document template' });
    }
  });
  
  // Delete document template
  app.delete('/api/admin/programs/:programId/documents/:docId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId, docId } = req.params;
      
      await db.delete(programDocumentTemplates).where(eq(programDocumentTemplates.id, parseInt(docId)));
      
      res.json({ success: true });
      const { syncProgramToProjects } = await import('./services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Delete program document error:', error);
      res.status(500).json({ error: 'Failed to delete document template' });
    }
  });
  
  // ==================== PROGRAM TASK TEMPLATES ROUTES ====================
  
  // Add task template to program
  app.post('/api/admin/programs/:programId/tasks', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      const { taskName, taskDescription, taskCategory, priority, sortOrder, stepId, stepDefinitionId, assignToRole, assignedTo, visibility } = req.body;
      
      if (!taskName) {
        return res.status(400).json({ error: 'Task name is required' });
      }

      let resolvedStepId = stepId || null;
      if (!resolvedStepId && stepDefinitionId) {
        const pid = parseInt(programId);
        const existing = await db.select({ id: programWorkflowSteps.id })
          .from(programWorkflowSteps)
          .where(and(eq(programWorkflowSteps.programId, pid), eq(programWorkflowSteps.stepDefinitionId, stepDefinitionId)))
          .limit(1);
        if (existing.length > 0) {
          resolvedStepId = existing[0].id;
        } else {
          const maxOrder = await db.select({ max: sql<number>`COALESCE(MAX(${programWorkflowSteps.stepOrder}), 0)` })
            .from(programWorkflowSteps)
            .where(eq(programWorkflowSteps.programId, pid));
          const [newStep] = await db.insert(programWorkflowSteps).values({
            programId: pid,
            stepDefinitionId,
            stepOrder: (maxOrder[0]?.max || 0) + 1,
            isRequired: true,
          }).returning();
          resolvedStepId = newStep.id;
        }
      }
      
      const [task] = await db.insert(programTaskTemplates).values({
        programId: parseInt(programId),
        taskName,
        taskDescription,
        taskCategory,
        priority: priority || 'medium',
        sortOrder: sortOrder || 0,
        stepId: resolvedStepId,
        assignToRole: assignedTo || assignToRole || 'admin',
        visibility: visibility || 'all',
      }).returning();
      
      res.json({ task });
      const { syncProgramToProjects } = await import('./services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Add program task error:', error);
      res.status(500).json({ error: 'Failed to add task template' });
    }
  });
  
  // Batch update task step assignments (MUST be before :taskId route)
  app.put('/api/admin/programs/:programId/tasks/batch-step', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { assignments } = req.body;
      if (!Array.isArray(assignments)) {
        return res.status(400).json({ error: 'Assignments must be an array' });
      }
      await db.transaction(async (tx) => {
        for (const assignment of assignments) {
          const updateData: any = { stepId: assignment.stepId ?? null };
          if (assignment.assignToRole !== undefined) updateData.assignToRole = assignment.assignToRole;
          await tx.update(programTaskTemplates)
            .set(updateData)
            .where(eq(programTaskTemplates.id, assignment.taskId));
        }
      });
      res.json({ success: true });
      const { programId } = req.params;
      const { syncProgramToProjects } = await import('./services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Batch update task steps error:', error);
      res.status(500).json({ error: 'Failed to update task assignments' });
    }
  });

  // Update task template
  app.put('/api/admin/programs/:programId/tasks/:taskId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { taskId } = req.params;
      const { taskName, taskDescription, taskCategory, priority, sortOrder, stepId, assignToRole } = req.body;
      
      const updateData: any = {};
      if (taskName !== undefined) updateData.taskName = taskName;
      if (taskDescription !== undefined) updateData.taskDescription = taskDescription;
      if (taskCategory !== undefined) updateData.taskCategory = taskCategory;
      if (priority !== undefined) updateData.priority = priority;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (stepId !== undefined) updateData.stepId = stepId;
      if (assignToRole !== undefined) updateData.assignToRole = assignToRole;
      
      const [task] = await db.update(programTaskTemplates)
        .set(updateData)
        .where(eq(programTaskTemplates.id, parseInt(taskId)))
        .returning();
      
      res.json({ task });
      const { syncProgramToProjects } = await import('./services/projectPipeline');
      syncProgramToProjects(parseInt(req.params.programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Update program task error:', error);
      res.status(500).json({ error: 'Failed to update task template' });
    }
  });
  
  // Delete task template
  app.delete('/api/admin/programs/:programId/tasks/:taskId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId, taskId } = req.params;
      
      await db.delete(programTaskTemplates).where(eq(programTaskTemplates.id, parseInt(taskId)));
      
      res.json({ success: true });
      const { syncProgramToProjects } = await import('./services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Delete program task error:', error);
      res.status(500).json({ error: 'Failed to delete task template' });
    }
  });

  // ==================== WORKFLOW STEP DEFINITIONS ROUTES ====================

  // Get all workflow step definitions
  app.get('/api/admin/workflow-steps', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const steps = await db.select().from(workflowStepDefinitions)
        .where(eq(workflowStepDefinitions.isActive, true))
        .orderBy(workflowStepDefinitions.sortOrder);
      res.json(steps);
    } catch (error) {
      console.error('Get workflow steps error:', error);
      res.status(500).json({ error: 'Failed to load workflow steps' });
    }
  });

  // Create workflow step definition
  app.post('/api/admin/workflow-steps', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, color, icon } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Step name is required' });
      }
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const existing = await db.select().from(workflowStepDefinitions).where(eq(workflowStepDefinitions.key, key));
      if (existing.length > 0) {
        return res.status(400).json({ error: 'A step with this name already exists' });
      }
      const maxOrder = await db.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(workflowStepDefinitions);
      const [step] = await db.insert(workflowStepDefinitions).values({
        name,
        key,
        description: description || null,
        color: color || '#6366f1',
        icon: icon || null,
        isDefault: false,
        isActive: true,
        sortOrder: (maxOrder[0]?.max || 0) + 1,
      }).returning();
      res.json({ step });
    } catch (error) {
      console.error('Create workflow step error:', error);
      res.status(500).json({ error: 'Failed to create workflow step' });
    }
  });

  // Update workflow step definition
  app.put('/api/admin/workflow-steps/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, color, icon } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (color !== undefined) updateData.color = color;
      if (icon !== undefined) updateData.icon = icon;
      const [step] = await db.update(workflowStepDefinitions)
        .set(updateData)
        .where(eq(workflowStepDefinitions.id, parseInt(id)))
        .returning();
      res.json({ step });
    } catch (error) {
      console.error('Update workflow step error:', error);
      res.status(500).json({ error: 'Failed to update workflow step' });
    }
  });

  // Delete (soft) workflow step definition
  app.delete('/api/admin/workflow-steps/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await db.update(workflowStepDefinitions)
        .set({ isActive: false })
        .where(eq(workflowStepDefinitions.id, parseInt(id)));
      res.json({ success: true });
    } catch (error) {
      console.error('Delete workflow step error:', error);
      res.status(500).json({ error: 'Failed to delete workflow step' });
    }
  });

  // ==================== PROGRAM WORKFLOW STEPS ROUTES ====================

  // Get workflow steps for a program
  app.get('/api/admin/programs/:programId/workflow-steps', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      const steps = await db.select({
        id: programWorkflowSteps.id,
        programId: programWorkflowSteps.programId,
        stepDefinitionId: programWorkflowSteps.stepDefinitionId,
        stepOrder: programWorkflowSteps.stepOrder,
        isRequired: programWorkflowSteps.isRequired,
        estimatedDays: programWorkflowSteps.estimatedDays,
        createdAt: programWorkflowSteps.createdAt,
        definition: {
          id: workflowStepDefinitions.id,
          name: workflowStepDefinitions.name,
          key: workflowStepDefinitions.key,
          description: workflowStepDefinitions.description,
          color: workflowStepDefinitions.color,
          icon: workflowStepDefinitions.icon,
        }
      })
        .from(programWorkflowSteps)
        .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
        .where(eq(programWorkflowSteps.programId, parseInt(programId)))
        .orderBy(programWorkflowSteps.stepOrder);
      res.json(steps);
    } catch (error) {
      console.error('Get program workflow steps error:', error);
      res.status(500).json({ error: 'Failed to load workflow steps' });
    }
  });

  // Save/replace all workflow steps for a program (batch operation)
  app.put('/api/admin/programs/:programId/workflow-steps', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      const { steps } = req.body;
      if (!Array.isArray(steps)) {
        return res.status(400).json({ error: 'Steps must be an array' });
      }
      const pid = parseInt(programId);
      const oldSteps = await db.select({
        id: programWorkflowSteps.id,
        stepDefinitionId: programWorkflowSteps.stepDefinitionId,
      }).from(programWorkflowSteps).where(eq(programWorkflowSteps.programId, pid));

      const oldDefIdToStepId = new Map<number, number>();
      for (const s of oldSteps) {
        oldDefIdToStepId.set(s.stepDefinitionId, s.id);
      }

      await db.transaction(async (tx) => {
        await tx.delete(programWorkflowSteps).where(eq(programWorkflowSteps.programId, pid));
        if (steps.length > 0) {
          const entries = steps.map((step: any, index: number) => ({
            programId: pid,
            stepDefinitionId: step.stepDefinitionId,
            stepOrder: index + 1,
            isRequired: step.isRequired !== false,
            estimatedDays: step.estimatedDays || null,
          }));
          await tx.insert(programWorkflowSteps).values(entries);
        }
      });

      const newSteps = await db.select({
        id: programWorkflowSteps.id,
        stepDefinitionId: programWorkflowSteps.stepDefinitionId,
      }).from(programWorkflowSteps).where(eq(programWorkflowSteps.programId, pid));

      const newDefIdToStepId = new Map<number, number>();
      for (const s of newSteps) {
        newDefIdToStepId.set(s.stepDefinitionId, s.id);
      }

      const oldStepIdToNew = new Map<number, number | null>();
      for (const [defId, oldId] of oldDefIdToStepId.entries()) {
        const newId = newDefIdToStepId.get(defId) ?? null;
        oldStepIdToNew.set(oldId, newId);
      }

      const docsToRemap = await db.select({ id: programDocumentTemplates.id, stepId: programDocumentTemplates.stepId })
        .from(programDocumentTemplates)
        .where(eq(programDocumentTemplates.programId, pid));

      for (const doc of docsToRemap) {
        if (doc.stepId) {
          const newStepId = oldStepIdToNew.get(doc.stepId) ?? null;
          if (newStepId !== doc.stepId) {
            await db.update(programDocumentTemplates)
              .set({ stepId: newStepId })
              .where(eq(programDocumentTemplates.id, doc.id));
          }
        }
      }

      const tasksToRemap = await db.select({ id: programTaskTemplates.id, stepId: programTaskTemplates.stepId })
        .from(programTaskTemplates)
        .where(eq(programTaskTemplates.programId, pid));

      for (const task of tasksToRemap) {
        if (task.stepId) {
          const newStepId = oldStepIdToNew.get(task.stepId) ?? null;
          if (newStepId !== task.stepId) {
            await db.update(programTaskTemplates)
              .set({ stepId: newStepId })
              .where(eq(programTaskTemplates.id, task.id));
          }
        }
      }

      const stagesToRemap = await db.select({ id: projectStages.id, programStepId: projectStages.programStepId })
        .from(projectStages)
        .innerJoin(projects, eq(projectStages.projectId, projects.id))
        .where(eq(projects.programId, pid));

      for (const stage of stagesToRemap) {
        if (stage.programStepId) {
          const newStepId = oldStepIdToNew.get(stage.programStepId) ?? null;
          if (newStepId !== stage.programStepId) {
            await db.update(projectStages)
              .set({ programStepId: newStepId })
              .where(eq(projectStages.id, stage.id));
          }
        }
      }
      const updated = await db.select({
        id: programWorkflowSteps.id,
        programId: programWorkflowSteps.programId,
        stepDefinitionId: programWorkflowSteps.stepDefinitionId,
        stepOrder: programWorkflowSteps.stepOrder,
        isRequired: programWorkflowSteps.isRequired,
        estimatedDays: programWorkflowSteps.estimatedDays,
        createdAt: programWorkflowSteps.createdAt,
        definition: {
          id: workflowStepDefinitions.id,
          name: workflowStepDefinitions.name,
          key: workflowStepDefinitions.key,
          description: workflowStepDefinitions.description,
          color: workflowStepDefinitions.color,
          icon: workflowStepDefinitions.icon,
        }
      })
        .from(programWorkflowSteps)
        .innerJoin(workflowStepDefinitions, eq(programWorkflowSteps.stepDefinitionId, workflowStepDefinitions.id))
        .where(eq(programWorkflowSteps.programId, parseInt(programId)))
        .orderBy(programWorkflowSteps.stepOrder);
      res.json(updated);
      const { syncProgramToProjects } = await import('./services/projectPipeline');
      syncProgramToProjects(parseInt(programId)).catch(err => console.error('Sync error:', err));
    } catch (error) {
      console.error('Save program workflow steps error:', error);
      res.status(500).json({ error: 'Failed to save workflow steps' });
    }
  });


  // ==================== PROGRAM REVIEW RULES ROUTES ====================

  app.get('/api/admin/programs/:programId/review-rules', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const programId = parseInt(req.params.programId);
      const rules = await storage.getReviewRulesByProgramId(programId);
      res.json({ rules });
    } catch (error: any) {
      console.error('Get review rules error:', error);
      res.status(500).json({ error: 'Failed to fetch review rules' });
    }
  });

  app.post('/api/admin/programs/:programId/review-rules', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const programId = parseInt(req.params.programId);
      const { rules } = req.body;
      if (!Array.isArray(rules)) {
        return res.status(400).json({ error: 'rules must be an array' });
      }
      await storage.deleteReviewRulesByProgramId(programId);
      const created = await storage.createReviewRules(
        rules.map((r: any, idx: number) => ({
          programId,
          documentType: r.documentType || 'General',
          ruleTitle: r.ruleTitle,
          ruleDescription: r.ruleDescription || null,
          category: r.category || null,
          isActive: r.isActive !== false,
          sortOrder: idx,
        }))
      );
      const guidelinesText = created.map(r => `[${r.documentType}] ${r.ruleTitle}: ${r.ruleDescription || ''}`).join('\n');
      await db.update(loanPrograms).set({ reviewGuidelines: guidelinesText }).where(eq(loanPrograms.id, programId));
      res.json({ rules: created });
    } catch (error: any) {
      console.error('Save review rules error:', error);
      res.status(500).json({ error: 'Failed to save review rules' });
    }
  });

  app.put('/api/admin/programs/:programId/review-rules/:ruleId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ruleId = parseInt(req.params.ruleId);
      const { ruleTitle, ruleDescription, documentType, category, isActive } = req.body;
      const updated = await storage.updateReviewRule(ruleId, {
        ...(ruleTitle !== undefined && { ruleTitle }),
        ...(ruleDescription !== undefined && { ruleDescription }),
        ...(documentType !== undefined && { documentType }),
        ...(category !== undefined && { category }),
        ...(isActive !== undefined && { isActive }),
      });
      res.json(updated);
    } catch (error: any) {
      console.error('Update review rule error:', error);
      res.status(500).json({ error: 'Failed to update review rule' });
    }
  });

  app.delete('/api/admin/programs/:programId/review-rules/:ruleId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ruleId = parseInt(req.params.ruleId);
      await storage.deleteReviewRule(ruleId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete review rule error:', error);
      res.status(500).json({ error: 'Failed to delete review rule' });
    }
  });

  // Per-document-template review rules
  app.get('/api/admin/document-templates/:templateId/review-rules', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.templateId);
      const rules = await storage.getReviewRulesByDocumentTemplateId(templateId);
      res.json({ rules });
    } catch (error: any) {
      console.error('Get template review rules error:', error);
      res.status(500).json({ error: 'Failed to fetch review rules' });
    }
  });

  app.post('/api/admin/document-templates/:templateId/review-rules', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.templateId);
      const { rules, programId } = req.body;
      if (!Array.isArray(rules)) {
        return res.status(400).json({ error: 'rules must be an array' });
      }
      await storage.deleteReviewRulesByDocumentTemplateId(templateId);
      if (rules.length === 0) {
        return res.json({ rules: [] });
      }
      const created = await storage.createReviewRules(
        rules.map((r: any, idx: number) => ({
          programId: programId || null,
          documentTemplateId: templateId,
          documentType: r.documentType || 'General',
          ruleTitle: r.ruleTitle,
          ruleDescription: r.ruleDescription || null,
          ruleType: r.ruleType || 'general',
          severity: r.severity || 'fail',
          category: r.category || null,
          isActive: r.isActive !== false,
          sortOrder: idx,
        }))
      );
      res.json({ rules: created });
    } catch (error: any) {
      console.error('Save template review rules error:', error);
      res.status(500).json({ error: 'Failed to save review rules' });
    }
  });

  // Generate review rule from voice/text using AI
  app.post('/api/admin/document-templates/:templateId/generate-rule-from-voice', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { audio, documentName } = req.body;
      if (!audio) {
        return res.status(400).json({ error: 'audio (base64) is required' });
      }

      const { ensureCompatibleFormat, speechToText } = await import('./replit_integrations/audio/client.js');
      const audioBuffer = Buffer.from(audio, 'base64');
      const { buffer: compatibleBuffer, format } = await ensureCompatibleFormat(audioBuffer);
      const transcript = await speechToText(compatibleBuffer, format);

      if (!transcript || transcript.trim().length === 0) {
        return res.status(400).json({ error: 'Could not transcribe audio. Please try again.' });
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || 'placeholder',
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `You are an expert at creating document review rules for loan underwriting. A lender is describing what they want an AI reviewer to check when reviewing "${documentName || 'a document'}". Convert their natural language description into a structured review rule. Respond with valid JSON only, no markdown:\n{"ruleTitle": "short title", "ruleDescription": "detailed instructions for the AI reviewer", "ruleType": "general|completeness|accuracy|compliance|formatting", "severity": "fail|warn|info"}`
          },
          {
            role: 'user',
            content: `The lender said: "${transcript}"`
          }
        ],
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content || '{}';
      const rule = JSON.parse(content);

      res.json({
        transcript,
        rule: {
          ruleTitle: rule.ruleTitle || 'Untitled Rule',
          ruleDescription: rule.ruleDescription || transcript,
          ruleType: rule.ruleType || 'general',
          severity: rule.severity || 'fail',
        }
      });
    } catch (error: any) {
      console.error('Generate rule from voice error:', error);
      res.status(500).json({ error: 'Failed to generate rule from voice' });
    }
  });

  app.post('/api/admin/programs/:programId/extract-rules', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const programId = parseInt(req.params.programId);
      const { fileContent, fileName } = req.body;
      if (!fileContent) {
        return res.status(400).json({ error: 'fileContent is required (base64 encoded)' });
      }

      const buffer = Buffer.from(fileContent, 'base64');
      let textContent = '';

      if (fileName?.toLowerCase().endsWith('.pdf')) {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        const textParts: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: any) => item.str).join(' ');
          textParts.push(pageText);
        }
        textContent = textParts.join('\n\n');
      } else if (fileName?.toLowerCase().match(/\.xlsx?$/)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheets: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          sheets.push(`--- Sheet: ${sheetName} ---\n${XLSX.utils.sheet_to_csv(sheet)}`);
        }
        textContent = sheets.join('\n\n');
      } else {
        textContent = buffer.toString('utf-8');
      }

      if (!textContent || textContent.trim().length < 20) {
        return res.status(400).json({ error: 'Could not extract meaningful text from this file.' });
      }

      const truncatedText = textContent.slice(0, 50000);

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert at analyzing loan credit policy documents and extracting specific, actionable review rules from them.

Given a credit policy document, extract individual rules that can be used to evaluate loan documents. Each rule should be specific and testable.

Group the rules by the document type they apply to. Common document types include:
- Credit Report
- Bank Statements
- Tax Returns
- Appraisal
- Title Report
- Insurance
- Entity Documents
- Income Verification
- Property Inspection
- Environmental Report
- Purchase Contract
- General / All Documents

For each rule, provide:
- documentType: which document type this rule applies to
- ruleTitle: a short, clear title
- ruleDescription: detailed description of what to check
- category: a category like "Credit", "Income", "Property", "Compliance", "LTV", "DSCR", "Eligibility", etc.
- confidence: "high" if the rule is clearly stated in the document, "medium" if it's implied or partially stated, "low" if you're uncertain about this rule's accuracy or interpretation

Respond ONLY with valid JSON in this format:
{
  "rules": [
    {
      "documentType": "Credit Report",
      "ruleTitle": "Minimum credit score",
      "ruleDescription": "Borrower must have a minimum FICO score of 680. If below 680, the loan is ineligible.",
      "category": "Credit",
      "confidence": "high"
    }
  ]
}`
          },
          {
            role: 'user',
            content: `Extract all review rules from the following credit policy document:\n\n${truncatedText}`
          }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: 'AI returned empty response' });
      }

      let parsed: { rules: any[] };
      try {
        parsed = JSON.parse(content);
      } catch {
        return res.status(500).json({ error: 'AI returned invalid response format' });
      }

      if (!parsed.rules || !Array.isArray(parsed.rules)) {
        return res.status(500).json({ error: 'AI did not return rules in expected format' });
      }

      res.json({ rules: parsed.rules, programId });
    } catch (error: any) {
      console.error('Extract rules error:', error);
      res.status(500).json({ error: 'Failed to extract rules from document' });
    }
  });

  // ==================== CREDIT POLICIES ROUTES ====================

  app.get('/api/admin/credit-policies', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.user!.id);
      const isSuperAdmin = user?.role === 'super_admin';
      const policies = isSuperAdmin 
        ? await db.select().from(creditPolicies).orderBy(desc(creditPolicies.createdAt))
        : await db.select().from(creditPolicies).where(eq(creditPolicies.createdBy, req.user!.id)).orderBy(desc(creditPolicies.createdAt));
      const policiesWithRuleCount = await Promise.all(
        policies.map(async (p) => {
          const rules = await storage.getReviewRulesByCreditPolicyId(p.id);
          return { ...p, ruleCount: rules.length };
        })
      );
      res.json(policiesWithRuleCount);
    } catch (error: any) {
      console.error('Get credit policies error:', error);
      res.status(500).json({ error: 'Failed to fetch credit policies' });
    }
  });

  app.get('/api/admin/credit-policies/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const policy = await storage.getCreditPolicyById(id);
      if (!policy) return res.status(404).json({ error: 'Credit policy not found' });
      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && policy.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to view this credit policy' });
      }
      const rules = await storage.getReviewRulesByCreditPolicyId(id);
      res.json({ ...policy, rules });
    } catch (error: any) {
      console.error('Get credit policy error:', error);
      res.status(500).json({ error: 'Failed to fetch credit policy' });
    }
  });

  app.post('/api/admin/credit-policies', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, sourceFileName, rules } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });

      const policy = await storage.createCreditPolicy({
        name,
        description: description || null,
        sourceFileName: sourceFileName || null,
        createdBy: req.user!.id,
      });

      let createdRules: any[] = [];
      if (Array.isArray(rules) && rules.length > 0) {
        createdRules = await storage.createReviewRules(
          rules.map((r: any, idx: number) => ({
            creditPolicyId: policy.id,
            programId: null,
            documentType: r.documentType || 'General',
            ruleTitle: r.ruleTitle,
            ruleDescription: r.ruleDescription || null,
            category: r.category || null,
            isActive: r.isActive !== false,
            sortOrder: idx,
          }))
        );
      }

      res.json({ ...policy, rules: createdRules });
    } catch (error: any) {
      console.error('Create credit policy error:', error);
      res.status(500).json({ error: 'Failed to create credit policy' });
    }
  });

  app.put('/api/admin/credit-policies/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existingPolicy = await storage.getCreditPolicyById(id);
      if (!existingPolicy) return res.status(404).json({ error: 'Credit policy not found' });
      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && existingPolicy.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to modify this credit policy' });
      }
      
      const { name, description, rules } = req.body;

      const policy = await storage.updateCreditPolicy(id, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
      });

      if (Array.isArray(rules)) {
        await storage.deleteReviewRulesByCreditPolicyId(id);
        if (rules.length > 0) {
          await storage.createReviewRules(
            rules.map((r: any, idx: number) => ({
              creditPolicyId: id,
              programId: null,
              documentType: r.documentType || 'General',
              ruleTitle: r.ruleTitle,
              ruleDescription: r.ruleDescription || null,
              category: r.category || null,
              isActive: r.isActive !== false,
              sortOrder: idx,
            }))
          );
        }
      }

      const updatedRules = await storage.getReviewRulesByCreditPolicyId(id);
      res.json({ ...policy, rules: updatedRules });
    } catch (error: any) {
      console.error('Update credit policy error:', error);
      res.status(500).json({ error: 'Failed to update credit policy' });
    }
  });

  app.delete('/api/admin/credit-policies/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existingPolicy = await storage.getCreditPolicyById(id);
      if (!existingPolicy) return res.status(404).json({ error: 'Credit policy not found' });
      const user = await storage.getUserById(req.user!.id);
      if (user?.role !== 'super_admin' && existingPolicy.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to delete this credit policy' });
      }
      await db.update(loanPrograms).set({ creditPolicyId: null }).where(eq(loanPrograms.creditPolicyId, id));
      await storage.deleteCreditPolicy(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete credit policy error:', error);
      res.status(500).json({ error: 'Failed to delete credit policy' });
    }
  });

  app.post('/api/admin/credit-policies/extract-rules', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { fileContent, fileName } = req.body;
      if (!fileContent) {
        return res.status(400).json({ error: 'fileContent is required (base64 encoded)' });
      }

      const buffer = Buffer.from(fileContent, 'base64');
      let textContent = '';

      if (fileName?.toLowerCase().endsWith('.pdf')) {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        const textParts: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: any) => item.str).join(' ');
          textParts.push(pageText);
        }
        textContent = textParts.join('\n\n');
      } else if (fileName?.toLowerCase().match(/\.xlsx?$/)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheets: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          sheets.push(`--- Sheet: ${sheetName} ---\n${XLSX.utils.sheet_to_csv(sheet)}`);
        }
        textContent = sheets.join('\n\n');
      } else {
        textContent = buffer.toString('utf-8');
      }

      if (!textContent || textContent.trim().length < 20) {
        return res.status(400).json({ error: 'Could not extract meaningful text from this file.' });
      }

      const truncatedText = textContent.slice(0, 50000);

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert at analyzing loan credit policy documents and extracting specific, actionable review rules from them.

Given a credit policy document, extract individual rules that can be used to evaluate loan documents. Each rule should be specific and testable.

Group the rules by the document type they apply to. Common document types include:
- Credit Report
- Bank Statements
- Tax Returns
- Appraisal
- Title Report
- Insurance
- Entity Documents
- Income Verification
- Property Inspection
- Environmental Report
- Purchase Contract
- General / All Documents

For each rule, provide:
- documentType: which document type this rule applies to
- ruleTitle: a short, clear title
- ruleDescription: detailed description of what to check
- category: a category like "Credit", "Income", "Property", "Compliance", "LTV", "DSCR", "Eligibility", etc.
- confidence: "high" if the rule is clearly stated in the document, "medium" if it's implied or partially stated, "low" if you're uncertain about this rule's accuracy or interpretation

Respond ONLY with valid JSON in this format:
{
  "rules": [
    {
      "documentType": "Credit Report",
      "ruleTitle": "Minimum credit score",
      "ruleDescription": "Borrower must have a minimum FICO score of 680. If below 680, the loan is ineligible.",
      "category": "Credit",
      "confidence": "high"
    }
  ]
}`
          },
          {
            role: 'user',
            content: `Extract all review rules from the following credit policy document:\n\n${truncatedText}`
          }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: 'AI returned empty response' });
      }

      let parsed: { rules: any[] };
      try {
        parsed = JSON.parse(content);
      } catch {
        return res.status(500).json({ error: 'AI returned invalid response format' });
      }

      if (!parsed.rules || !Array.isArray(parsed.rules)) {
        return res.status(500).json({ error: 'AI did not return rules in expected format' });
      }

      res.json({ rules: parsed.rules });
    } catch (error: any) {
      console.error('Extract rules error:', error);
      res.status(500).json({ error: 'Failed to extract rules from document' });
    }
  });

  // Credit Policy Chat - conversational rule extraction
  app.post('/api/admin/credit-policies/chat', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { messages, existingRules } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array is required' });
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const existingRulesContext = existingRules && existingRules.length > 0
        ? `\n\nThe policy already has these rules extracted:\n${existingRules.map((r: any, i: number) => `${i + 1}. [${r.documentType}] ${r.ruleTitle}: ${r.ruleDescription}`).join('\n')}`
        : '';

      const systemPrompt = `You are a credit policy specialist helping a lender define their loan credit policy rules. Your job is to have a natural conversation to understand the nuances of their lending guidelines and extract specific, actionable rules.

Ask clarifying questions to understand details like:
- Minimum credit scores, DSCR ratios, LTV limits
- Property type restrictions and eligibility criteria
- Documentation requirements and verification standards
- Income and asset requirements
- Reserve requirements
- Any special conditions or exceptions

When the user provides information that can be turned into specific rules, extract them.

IMPORTANT: Your response must ALWAYS be valid JSON in this exact format:
{
  "reply": "Your conversational response to the user",
  "newRules": [
    {
      "documentType": "Credit Report",
      "ruleTitle": "Short rule title",
      "ruleDescription": "Detailed description of what to check",
      "category": "Credit"
    }
  ]
}

Common document types: Credit Report, Bank Statements, Tax Returns, Appraisal, Title Report, Insurance, Entity Documents, Income Verification, Property Inspection, Environmental Report, Purchase Contract, General / All Documents.

Common categories: Credit, Income, Property, Compliance, LTV, DSCR, Eligibility, Reserves, Documentation, Insurance.

If the user's message doesn't contain enough detail to extract rules yet, return an empty newRules array and ask follow-up questions.
If the user provides specific criteria, extract as many rules as you can from their message.${existingRulesContext}`;

      const validRoles = ['user', 'assistant'];
      const sanitizedMessages = messages
        .filter((m: any) => validRoles.includes(m.role) && typeof m.content === 'string')
        .map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      if (sanitizedMessages.length === 0) {
        return res.status(400).json({ error: 'No valid messages provided' });
      }

      const chatMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...sanitizedMessages,
      ];

      const response = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: chatMessages,
        response_format: { type: 'json_object' },
        max_completion_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: 'AI returned empty response' });
      }

      let parsed: { reply: string; newRules?: any[] };
      try {
        parsed = JSON.parse(content);
      } catch {
        return res.json({ reply: content, newRules: [] });
      }

      res.json({
        reply: parsed.reply || '',
        newRules: Array.isArray(parsed.newRules) ? parsed.newRules : [],
      });
    } catch (error: any) {
      console.error('Credit policy chat error:', error);
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  });

  // ==================== COMMUNICATION ROUTES ====================

  app.post('/api/communication/sms', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { to, message, dealId } = req.body;
      if (!to || !message) {
        return res.status(400).json({ error: 'Phone number and message are required' });
      }
      const { sendCustomSms } = await import('./smsService');
      const result = await sendCustomSms(to, message);
      if (result.success) {
        if (dealId) {
          await storage.createProjectActivity({
            projectId: dealId,
            userId: req.user!.id,
            activityType: 'sms_sent',
            activityDescription: `SMS sent to ${to}`,
            visibleToBorrower: false,
          });
        }
        res.json({ success: true, messageId: result.messageId });
      } else {
        res.status(500).json({ error: result.error || 'Failed to send SMS' });
      }
    } catch (error: any) {
      console.error('Communication SMS error:', error);
      res.status(500).json({ error: 'Failed to send SMS' });
    }
  });

  app.post('/api/communication/call', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { to, dealId } = req.body;
      if (!to) {
        return res.status(400).json({ error: 'Phone number is required' });
      }
      const { getTwilioClient, getTwilioFromPhoneNumber } = await import('./smsService');
      const client = await getTwilioClient();
      const fromNumber = await getTwilioFromPhoneNumber();
      if (!fromNumber) {
        return res.status(500).json({ error: 'Twilio phone number not configured' });
      }
      let normalizedTo = to.replace(/\D/g, '');
      if (!normalizedTo.startsWith('1') && normalizedTo.length === 10) {
        normalizedTo = '1' + normalizedTo;
      }
      if (!normalizedTo.startsWith('+')) {
        normalizedTo = '+' + normalizedTo;
      }
      const call = await client.calls.create({
        to: normalizedTo,
        from: fromNumber,
        url: 'http://demo.twilio.com/docs/voice.xml',
      });
      if (dealId) {
        await storage.createProjectActivity({
          projectId: dealId,
          userId: req.user!.id,
          activityType: 'call_initiated',
          activityDescription: `Call initiated to ${to}`,
          visibleToBorrower: false,
        });
      }
      res.json({ success: true, callSid: call.sid });
    } catch (error: any) {
      console.error('Communication call error:', error);
      res.status(500).json({ error: 'Failed to initiate call' });
    }
  });

  // ==================== DEAL PROCESSORS ROUTES ====================

  // Get processors for a project/deal
  app.get('/api/admin/projects/:projectId/processors', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      const processors = await db.select({
        id: dealProcessors.id,
        projectId: dealProcessors.projectId,
        userId: dealProcessors.userId,
        role: dealProcessors.role,
        assignedAt: dealProcessors.assignedAt,
        assignedBy: dealProcessors.assignedBy,
        user: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
        }
      })
        .from(dealProcessors)
        .innerJoin(users, eq(dealProcessors.userId, users.id))
        .where(eq(dealProcessors.projectId, parseInt(projectId)));
      res.json(processors);
    } catch (error) {
      console.error('Get deal processors error:', error);
      res.status(500).json({ error: 'Failed to load processors' });
    }
  });

  // Add processor to a project/deal
  app.post('/api/admin/projects/:projectId/processors', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      const existing = await db.select().from(dealProcessors).where(
        and(
          eq(dealProcessors.projectId, parseInt(projectId)),
          eq(dealProcessors.userId, parseInt(userId))
        )
      );
      if (existing.length > 0) {
        return res.status(400).json({ error: 'This user is already assigned as a processor' });
      }
      const [processor] = await db.insert(dealProcessors).values({
        projectId: parseInt(projectId),
        userId: parseInt(userId),
        role: 'processor',
        assignedBy: req.user?.id || null,
      }).returning();
      res.json({ processor });
    } catch (error) {
      console.error('Add deal processor error:', error);
      res.status(500).json({ error: 'Failed to add processor' });
    }
  });

  // Remove processor from a project/deal
  app.delete('/api/admin/projects/:projectId/processors/:processorId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { processorId } = req.params;
      await db.delete(dealProcessors).where(eq(dealProcessors.id, parseInt(processorId)));
      res.json({ success: true });
    } catch (error) {
      console.error('Remove deal processor error:', error);
      res.status(500).json({ error: 'Failed to remove processor' });
    }
  });

  // Get all users with processor role for selection
  app.get('/api/admin/processors', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const processorUsers = await db.select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        roles: users.roles,
        userType: users.userType,
      })
        .from(users)
        .where(
          and(
            eq(users.isActive, true),
            or(
              eq(users.role, 'processor'),
              eq(users.role, 'staff'),
              eq(users.role, 'admin'),
              eq(users.role, 'super_admin'),
              sql`'processor' = ANY(COALESCE(${users.roles}, ARRAY[]::text[]))`
            )
          )
        );
      res.json(processorUsers);
    } catch (error) {
      console.error('Get processors error:', error);
      res.status(500).json({ error: 'Failed to load processors' });
    }
  });

  // ==================== PRICING RULESETS ROUTES ====================
  
  // List rulesets for a program
  app.get('/api/admin/programs/:programId/rulesets', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      
      const rulesets = await db.select()
        .from(pricingRulesets)
        .where(eq(pricingRulesets.programId, parseInt(programId)))
        .orderBy(desc(pricingRulesets.version));
      
      res.json({ rulesets });
    } catch (error) {
      console.error('List rulesets error:', error);
      res.status(500).json({ error: 'Failed to list rulesets' });
    }
  });
  
  // Get single ruleset
  app.get('/api/admin/rulesets/:rulesetId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rulesetId } = req.params;
      
      const [ruleset] = await db.select()
        .from(pricingRulesets)
        .where(eq(pricingRulesets.id, parseInt(rulesetId)));
      
      if (!ruleset) {
        return res.status(404).json({ error: 'Ruleset not found' });
      }
      
      res.json({ ruleset });
    } catch (error) {
      console.error('Get ruleset error:', error);
      res.status(500).json({ error: 'Failed to get ruleset' });
    }
  });
  
  // Get active ruleset for a program
  app.get('/api/programs/:programId/active-ruleset', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      
      const [ruleset] = await db.select()
        .from(pricingRulesets)
        .where(and(
          eq(pricingRulesets.programId, parseInt(programId)),
          eq(pricingRulesets.status, 'active')
        ));
      
      if (!ruleset) {
        return res.status(404).json({ error: 'No active ruleset found' });
      }
      
      res.json({ ruleset });
    } catch (error) {
      console.error('Get active ruleset error:', error);
      res.status(500).json({ error: 'Failed to get active ruleset' });
    }
  });
  
  // Create new ruleset version
  app.post('/api/admin/programs/:programId/rulesets', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      const { name, description, rulesJson } = req.body;
      
      // Validate the rules JSON
      const parseResult = pricingRulesSchema.safeParse(rulesJson);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: 'Invalid rules JSON', 
          details: parseResult.error.errors 
        });
      }
      
      // Get the next version number
      const existingRulesets = await db.select()
        .from(pricingRulesets)
        .where(eq(pricingRulesets.programId, parseInt(programId)))
        .orderBy(desc(pricingRulesets.version))
        .limit(1);
      
      const nextVersion = (existingRulesets[0]?.version ?? 0) + 1;
      
      const [ruleset] = await db.insert(pricingRulesets)
        .values({
          programId: parseInt(programId),
          version: nextVersion,
          name: name || `Version ${nextVersion}`,
          description,
          rulesJson: parseResult.data,
          status: 'draft',
          createdBy: req.user!.id
        })
        .returning();
      
      res.status(201).json({ ruleset });
    } catch (error) {
      console.error('Create ruleset error:', error);
      res.status(500).json({ error: 'Failed to create ruleset' });
    }
  });
  
  // Update ruleset
  app.put('/api/admin/rulesets/:rulesetId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rulesetId } = req.params;
      const { name, description, rulesJson } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      
      if (rulesJson !== undefined) {
        const parseResult = pricingRulesSchema.safeParse(rulesJson);
        if (!parseResult.success) {
          return res.status(400).json({ 
            error: 'Invalid rules JSON', 
            details: parseResult.error.errors 
          });
        }
        updateData.rulesJson = parseResult.data;
      }
      
      const [ruleset] = await db.update(pricingRulesets)
        .set(updateData)
        .where(eq(pricingRulesets.id, parseInt(rulesetId)))
        .returning();
      
      res.json({ ruleset });
    } catch (error) {
      console.error('Update ruleset error:', error);
      res.status(500).json({ error: 'Failed to update ruleset' });
    }
  });
  
  // Activate a ruleset (and deactivate others for same program)
  app.post('/api/admin/rulesets/:rulesetId/activate', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rulesetId } = req.params;
      
      // Get the ruleset to find its program
      const [ruleset] = await db.select()
        .from(pricingRulesets)
        .where(eq(pricingRulesets.id, parseInt(rulesetId)));
      
      if (!ruleset) {
        return res.status(404).json({ error: 'Ruleset not found' });
      }
      
      // Deactivate all other rulesets for this program
      await db.update(pricingRulesets)
        .set({ status: 'archived', archivedAt: new Date() })
        .where(and(
          eq(pricingRulesets.programId, ruleset.programId),
          eq(pricingRulesets.status, 'active')
        ));
      
      // Activate the selected ruleset
      const [activated] = await db.update(pricingRulesets)
        .set({ status: 'active', activatedAt: new Date() })
        .where(eq(pricingRulesets.id, parseInt(rulesetId)))
        .returning();
      
      res.json({ ruleset: activated });
    } catch (error) {
      console.error('Activate ruleset error:', error);
      res.status(500).json({ error: 'Failed to activate ruleset' });
    }
  });
  
  // Delete ruleset (only if draft)
  app.delete('/api/admin/rulesets/:rulesetId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rulesetId } = req.params;
      
      const [ruleset] = await db.select()
        .from(pricingRulesets)
        .where(eq(pricingRulesets.id, parseInt(rulesetId)));
      
      if (!ruleset) {
        return res.status(404).json({ error: 'Ruleset not found' });
      }
      
      if (ruleset.status === 'active') {
        return res.status(400).json({ error: 'Cannot delete active ruleset' });
      }
      
      await db.delete(pricingRulesets).where(eq(pricingRulesets.id, parseInt(rulesetId)));
      
      res.json({ success: true });
    } catch (error) {
      console.error('Delete ruleset error:', error);
      res.status(500).json({ error: 'Failed to delete ruleset' });
    }
  });
  
  // Create sample ruleset for a program
  app.post('/api/admin/programs/:programId/rulesets/sample', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      
      // Get the program to determine loan type
      const [program] = await db.select()
        .from(loanPrograms)
        .where(eq(loanPrograms.id, parseInt(programId)));
      
      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }
      
      // Choose sample ruleset based on loan type
      const sampleRules = program.loanType === 'dscr' ? SAMPLE_DSCR_RULESET : SAMPLE_RTL_RULESET;
      
      // Get the next version number
      const existingRulesets = await db.select()
        .from(pricingRulesets)
        .where(eq(pricingRulesets.programId, parseInt(programId)))
        .orderBy(desc(pricingRulesets.version))
        .limit(1);
      
      const nextVersion = (existingRulesets[0]?.version ?? 0) + 1;
      
      const [ruleset] = await db.insert(pricingRulesets)
        .values({
          programId: parseInt(programId),
          version: nextVersion,
          name: `Sample ${program.loanType.toUpperCase()} Ruleset`,
          description: 'Auto-generated sample ruleset with typical pricing rules',
          rulesJson: sampleRules,
          status: 'draft',
          createdBy: req.user!.id
        })
        .returning();
      
      res.status(201).json({ ruleset });
    } catch (error) {
      console.error('Create sample ruleset error:', error);
      res.status(500).json({ error: 'Failed to create sample ruleset' });
    }
  });
  
  // ==================== PRICING QUOTE ROUTES ====================
  
  // Calculate price using active ruleset
  app.post('/api/pricing/calculate', authenticateUser, requireOnboarding, async (req: AuthRequest, res: Response) => {
    try {
      const { programId, inputs } = req.body;
      
      if (!programId || !inputs) {
        return res.status(400).json({ error: 'programId and inputs are required' });
      }
      
      // Get the active ruleset for this program
      const [ruleset] = await db.select()
        .from(pricingRulesets)
        .where(and(
          eq(pricingRulesets.programId, parseInt(programId)),
          eq(pricingRulesets.status, 'active')
        ));
      
      if (!ruleset) {
        return res.status(404).json({ error: 'No active pricing ruleset for this program' });
      }
      
      // Calculate pricing
      const result = priceQuote(ruleset.rulesJson as any, inputs as PricingInputs);
      
      // Log the quote
      await db.insert(pricingQuoteLogs).values({
        programId: parseInt(programId),
        rulesetId: ruleset.id,
        userId: req.user!.id,
        inputsJson: inputs,
        outputsJson: result,
        eligible: result.eligible,
        finalRate: result.finalRate,
        points: result.points
      });
      
      res.json({ 
        result,
        rulesetId: ruleset.id,
        rulesetVersion: ruleset.version
      });
    } catch (error) {
      console.error('Calculate pricing error:', error);
      res.status(500).json({ error: 'Failed to calculate pricing' });
    }
  });
  
  // Calculate RTL pricing (Fix and Flip / Ground Up Construction)
  app.post('/api/pricing/rtl', authenticateUser, requireOnboarding, async (req: AuthRequest, res: Response) => {
    try {
      const { calculateRTLPricing } = await import('./pricing/rtl-engine');
      const { rtlPricingFormSchema } = await import('@shared/schema');
      
      const parseResult = rtlPricingFormSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: 'Invalid input', 
          details: parseResult.error.issues 
        });
      }
      
      const result = calculateRTLPricing(parseResult.data);
      
      res.json(result);
    } catch (error) {
      console.error('RTL pricing error:', error);
      res.status(500).json({ error: 'Failed to calculate RTL pricing' });
    }
  });

  // Test pricing with a specific ruleset (admin only)
  app.post('/api/admin/rulesets/:rulesetId/test', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { rulesetId } = req.params;
      const { inputs } = req.body;
      
      const [ruleset] = await db.select()
        .from(pricingRulesets)
        .where(eq(pricingRulesets.id, parseInt(rulesetId)));
      
      if (!ruleset) {
        return res.status(404).json({ error: 'Ruleset not found' });
      }
      
      const result = priceQuote(ruleset.rulesJson as any, inputs as PricingInputs);
      
      res.json({ result });
    } catch (error) {
      console.error('Test ruleset error:', error);
      res.status(500).json({ error: 'Failed to test ruleset' });
    }
  });
  
  // ==================== RULE PROPOSALS ROUTES ====================
  
  // List proposals for a program
  app.get('/api/admin/programs/:programId/proposals', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      const { status } = req.query;
      
      let query = db.select()
        .from(ruleProposals)
        .where(eq(ruleProposals.programId, parseInt(programId)));
      
      if (status && typeof status === 'string') {
        query = db.select()
          .from(ruleProposals)
          .where(and(
            eq(ruleProposals.programId, parseInt(programId)),
            eq(ruleProposals.status, status)
          ));
      }
      
      const proposals = await query.orderBy(desc(ruleProposals.createdAt));
      
      res.json({ proposals });
    } catch (error) {
      console.error('List proposals error:', error);
      res.status(500).json({ error: 'Failed to list proposals' });
    }
  });
  
  // Accept/reject a proposal
  app.post('/api/admin/proposals/:proposalId/review', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { proposalId } = req.params;
      const { status, reviewNotes, modifiedProposal } = req.body;
      
      if (!['accepted', 'rejected', 'modified'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      
      const updateData: any = {
        status,
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
        reviewNotes
      };
      
      if (status === 'modified' && modifiedProposal) {
        updateData.proposalJson = modifiedProposal;
      }
      
      const [proposal] = await db.update(ruleProposals)
        .set(updateData)
        .where(eq(ruleProposals.id, parseInt(proposalId)))
        .returning();
      
      res.json({ proposal });
    } catch (error) {
      console.error('Review proposal error:', error);
      res.status(500).json({ error: 'Failed to review proposal' });
    }
  });
  
  // Get programs with active rulesets (for quote page)
  app.get('/api/programs-with-pricing', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.user!.id);
      const isSuperAdmin = user?.role === 'super_admin';
      const programs = await db.select()
        .from(loanPrograms)
        .where(isSuperAdmin 
          ? eq(loanPrograms.isActive, true)
          : and(eq(loanPrograms.isActive, true), eq(loanPrograms.createdBy, req.user!.id))
        )
        .orderBy(loanPrograms.sortOrder);
      
      // Check which have active rulesets
      const programsWithStatus = await Promise.all(programs.map(async (program) => {
        const [activeRuleset] = await db.select()
          .from(pricingRulesets)
          .where(and(
            eq(pricingRulesets.programId, program.id),
            eq(pricingRulesets.status, 'active')
          ));
        
        return {
          ...program,
          hasActiveRuleset: !!activeRuleset,
          activeRulesetId: activeRuleset?.id,
          activeRulesetVersion: activeRuleset?.version
        };
      }));
      
      res.json({ programs: programsWithStatus });
    } catch (error) {
      console.error('Get programs with pricing error:', error);
      res.status(500).json({ error: 'Failed to get programs' });
    }
  });

  // ==================== AI RULE PROPOSAL ROUTES ====================
  
  // Analyze guidelines and generate rule proposal
  app.post('/api/admin/programs/:programId/ai-analyze', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { programId } = req.params;
      const { guidelineText } = req.body;
      
      if (!guidelineText || typeof guidelineText !== 'string') {
        return res.status(400).json({ error: 'guidelineText is required' });
      }
      
      // Get the program
      const [program] = await db.select()
        .from(loanPrograms)
        .where(eq(loanPrograms.id, parseInt(programId)));
      
      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }
      
      // Save the guideline upload
      const [upload] = await db.insert(guidelineUploads)
        .values({
          programId: parseInt(programId),
          fileName: 'text-input',
          fileUrl: null,
          textContent: guidelineText,
          uploadedBy: req.user!.id
        })
        .returning();
      
      // Analyze with AI
      const result = await analyzeGuidelines({
        guidelineText,
        loanType: program.loanType as 'rtl' | 'dscr',
        programName: program.name
      });
      
      if (!result.success) {
        return res.status(422).json({ error: result.error });
      }
      
      // Save the proposal
      const [proposal] = await db.insert(ruleProposals)
        .values({
          programId: parseInt(programId),
          guidelineUploadId: upload.id,
          proposalJson: result.proposal,
          aiExplanation: result.explanation,
          status: 'pending',
          createdBy: req.user!.id
        })
        .returning();
      
      res.status(201).json({
        proposal,
        explanation: result.explanation
      });
    } catch (error) {
      console.error('AI analyze error:', error);
      res.status(500).json({ error: 'Failed to analyze guidelines' });
    }
  });
  
  // Refine an existing proposal with feedback
  app.post('/api/admin/proposals/:proposalId/refine', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { proposalId } = req.params;
      const { feedback } = req.body;
      
      if (!feedback || typeof feedback !== 'string') {
        return res.status(400).json({ error: 'feedback is required' });
      }
      
      // Get the current proposal
      const [proposal] = await db.select()
        .from(ruleProposals)
        .where(eq(ruleProposals.id, parseInt(proposalId)));
      
      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }
      
      // Refine with AI
      const result = await refineProposal(proposal.proposalJson as any, feedback);
      
      if (!result.success) {
        return res.status(422).json({ error: result.error });
      }
      
      // Update the proposal
      const [updated] = await db.update(ruleProposals)
        .set({
          proposalJson: result.proposal,
          aiExplanation: result.explanation,
          status: 'pending'
        })
        .where(eq(ruleProposals.id, parseInt(proposalId)))
        .returning();
      
      res.json({
        proposal: updated,
        explanation: result.explanation
      });
    } catch (error) {
      console.error('Refine proposal error:', error);
      res.status(500).json({ error: 'Failed to refine proposal' });
    }
  });
  
  // Convert an accepted proposal to a ruleset
  app.post('/api/admin/proposals/:proposalId/deploy', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { proposalId } = req.params;
      const { name, description, activateImmediately } = req.body;
      
      // Get the proposal
      const [proposal] = await db.select()
        .from(ruleProposals)
        .where(eq(ruleProposals.id, parseInt(proposalId)));
      
      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }
      
      // Get next version number
      const existingRulesets = await db.select()
        .from(pricingRulesets)
        .where(eq(pricingRulesets.programId, proposal.programId))
        .orderBy(desc(pricingRulesets.version))
        .limit(1);
      
      const nextVersion = (existingRulesets[0]?.version ?? 0) + 1;
      
      // If activating immediately, deactivate existing active ruleset
      if (activateImmediately) {
        await db.update(pricingRulesets)
          .set({ status: 'archived', archivedAt: new Date() })
          .where(and(
            eq(pricingRulesets.programId, proposal.programId),
            eq(pricingRulesets.status, 'active')
          ));
      }
      
      // Create the ruleset
      const [ruleset] = await db.insert(pricingRulesets)
        .values({
          programId: proposal.programId,
          version: nextVersion,
          name: name || `AI Generated v${nextVersion}`,
          description: description || proposal.aiExplanation,
          rulesJson: proposal.proposalJson,
          status: activateImmediately ? 'active' : 'draft',
          createdBy: req.user!.id,
          activatedAt: activateImmediately ? new Date() : null
        })
        .returning();
      
      // Mark the proposal as accepted
      await db.update(ruleProposals)
        .set({
          status: 'accepted',
          reviewedBy: req.user!.id,
          reviewedAt: new Date()
        })
        .where(eq(ruleProposals.id, parseInt(proposalId)));
      
      res.status(201).json({ ruleset });
    } catch (error) {
      console.error('Deploy proposal error:', error);
      res.status(500).json({ error: 'Failed to deploy proposal' });
    }
  });

  // ==================== ONBOARDING SYSTEM ====================

  // Get user's onboarding status and documents
  app.get('/api/onboarding/status', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Get all onboarding documents for this user type
      const documents = await db.select()
        .from(onboardingDocuments)
        .where(and(
          eq(onboardingDocuments.isActive, true),
          sql`(${onboardingDocuments.targetUserType} = ${user.userType} OR ${onboardingDocuments.targetUserType} = 'all')`
        ))
        .orderBy(onboardingDocuments.sortOrder);
      
      // Get user's progress
      const progress = await db.select()
        .from(userOnboardingProgress)
        .where(eq(userOnboardingProgress.userId, userId));
      
      const progressMap = new Map(progress.map(p => [p.documentId, p]));
      
      // Combine documents with progress
      const documentsWithProgress = documents.map(doc => ({
        ...doc,
        progress: progressMap.get(doc.id) || null
      }));
      
      // Check if partnership agreement is signed (for brokers)
      const partnershipAgreement = documents.find(d => d.type === 'partnership_agreement');
      const agreementSigned = partnershipAgreement 
        ? progressMap.get(partnershipAgreement.id)?.status === 'signed'
        : true;
      
      // Check if required training is completed
      const requiredTraining = documents.filter(d => d.type !== 'partnership_agreement' && d.isRequired);
      const trainingCompleted = requiredTraining.every(doc => {
        const prog = progressMap.get(doc.id);
        return prog && (prog.status === 'completed' || prog.status === 'viewed');
      });
      
      res.json({
        user: {
          id: user.id,
          userType: user.userType,
          onboardingCompleted: user.onboardingCompleted,
          partnershipAgreementSignedAt: user.partnershipAgreementSignedAt,
          trainingCompletedAt: user.trainingCompletedAt
        },
        documents: documentsWithProgress,
        agreementSigned,
        trainingCompleted,
        canProceed: user.userType === 'borrower' || (agreementSigned && trainingCompleted)
      });
    } catch (error) {
      console.error('Get onboarding status error:', error);
      res.status(500).json({ error: 'Failed to get onboarding status' });
    }
  });

  // Update progress on a document
  app.post('/api/onboarding/progress', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { documentId, status, signatureData } = req.body;
      
      if (!documentId || !status) {
        return res.status(400).json({ error: 'documentId and status are required' });
      }
      
      // Check if progress exists
      const existingProgress = await db.select()
        .from(userOnboardingProgress)
        .where(and(
          eq(userOnboardingProgress.userId, userId),
          eq(userOnboardingProgress.documentId, documentId)
        ))
        .limit(1);
      
      const now = new Date();
      let progress;
      
      if (existingProgress.length > 0) {
        // Update existing progress
        [progress] = await db.update(userOnboardingProgress)
          .set({
            status,
            signatureData: signatureData || existingProgress[0].signatureData,
            signedAt: status === 'signed' ? now : existingProgress[0].signedAt,
            completedAt: (status === 'completed' || status === 'signed') ? now : existingProgress[0].completedAt
          })
          .where(eq(userOnboardingProgress.id, existingProgress[0].id))
          .returning();
      } else {
        // Create new progress
        [progress] = await db.insert(userOnboardingProgress)
          .values({
            userId,
            documentId,
            status,
            signatureData,
            signedAt: status === 'signed' ? now : null,
            completedAt: (status === 'completed' || status === 'signed') ? now : null
          })
          .returning();
      }
      
      // If this is a partnership agreement signature, update user record
      const document = await db.select()
        .from(onboardingDocuments)
        .where(eq(onboardingDocuments.id, documentId))
        .limit(1);
      
      if (document[0]?.type === 'partnership_agreement' && status === 'signed') {
        await db.update(users)
          .set({ partnershipAgreementSignedAt: now })
          .where(eq(users.id, userId));
      }
      
      res.json({ success: true, progress });
    } catch (error) {
      console.error('Update onboarding progress error:', error);
      res.status(500).json({ error: 'Failed to update progress' });
    }
  });

  // Complete onboarding
  app.post('/api/onboarding/complete', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Verify all required steps are completed
      const documents = await db.select()
        .from(onboardingDocuments)
        .where(and(
          eq(onboardingDocuments.isActive, true),
          eq(onboardingDocuments.isRequired, true),
          sql`(${onboardingDocuments.targetUserType} = ${user.userType} OR ${onboardingDocuments.targetUserType} = 'all')`
        ));
      
      const progress = await db.select()
        .from(userOnboardingProgress)
        .where(eq(userOnboardingProgress.userId, userId));
      
      const progressMap = new Map(progress.map(p => [p.documentId, p]));
      
      // Check if partnership agreement is signed (if required)
      const partnershipAgreement = documents.find(d => d.type === 'partnership_agreement');
      if (partnershipAgreement) {
        const agreementProgress = progressMap.get(partnershipAgreement.id);
        if (!agreementProgress || agreementProgress.status !== 'signed') {
          return res.status(400).json({ error: 'Partnership agreement must be signed first' });
        }
      }
      
      // Mark onboarding as complete
      const now = new Date();
      await db.update(users)
        .set({
          onboardingCompleted: true,
          trainingCompletedAt: now
        })
        .where(eq(users.id, userId));
      
      res.json({ success: true, message: 'Onboarding completed successfully' });
    } catch (error) {
      console.error('Complete onboarding error:', error);
      res.status(500).json({ error: 'Failed to complete onboarding' });
    }
  });

  // Save communication consent preferences
  app.post('/api/onboarding/consent', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { emailConsent, smsConsent } = req.body;
      await db.update(users)
        .set({
          emailConsent: !!emailConsent,
          smsConsent: !!smsConsent,
        })
        .where(eq(users.id, userId));
      res.json({ success: true });
    } catch (error) {
      console.error('Save consent error:', error);
      res.status(500).json({ error: 'Failed to save consent preferences' });
    }
  });

  // ==================== ADMIN ONBOARDING MANAGEMENT ====================

  // Get all onboarding documents (admin)
  app.get('/api/admin/onboarding/documents', authenticateUser, requireAdmin, requirePermission('onboarding.view'), async (req: AuthRequest, res: Response) => {
    try {
      const documents = await db.select()
        .from(onboardingDocuments)
        .orderBy(onboardingDocuments.sortOrder);
      
      res.json({ documents });
    } catch (error) {
      console.error('Get onboarding documents error:', error);
      res.status(500).json({ error: 'Failed to get documents' });
    }
  });

  // Get presigned URL for onboarding file upload (admin)
  app.post('/api/admin/onboarding/upload-url', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, contentType } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'File name is required' });
      }
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const isLocal = uploadURL.startsWith('__local__:');
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      
      res.json({
        uploadURL: isLocal ? '/api/admin/onboarding/upload-direct' : uploadURL,
        objectPath,
        useDirectUpload: isLocal,
        metadata: { name, contentType },
      });
    } catch (error) {
      console.error('Get onboarding upload URL error:', error);
      res.status(500).json({ error: 'Failed to get upload URL' });
    }
  });

  // Onboarding direct upload (local storage fallback)
  const onboardingMulterUpload = multer({ dest: path.join(process.cwd(), 'uploads', 'temp') });
  app.post('/api/admin/onboarding/upload-direct', authenticateUser, requireAdmin, onboardingMulterUpload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }
      const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const objectId = randomUUID();
      const destPath = path.join(uploadsDir, objectId);
      fs.renameSync(req.file.path, destPath);
      fs.writeFileSync(destPath + '.meta', JSON.stringify({
        fileName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
      }));
      res.json({
        objectPath: `/objects/uploads/${objectId}`,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (error) {
      console.error('Direct onboarding upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // Create onboarding document (admin)
  app.post('/api/admin/onboarding/documents', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { type, title, description, fileUrl, externalUrl, thumbnailUrl, sortOrder, isRequired, isActive, targetUserType } = req.body;
      
      if (!type || !title) {
        return res.status(400).json({ error: 'type and title are required' });
      }
      
      const [document] = await db.insert(onboardingDocuments)
        .values({
          type,
          title,
          description,
          fileUrl,
          externalUrl,
          thumbnailUrl,
          sortOrder: sortOrder || 0,
          isRequired: isRequired !== false,
          isActive: isActive !== false,
          targetUserType: targetUserType || 'broker',
          createdBy: req.user!.id
        })
        .returning();
      
      res.status(201).json({ document });
    } catch (error) {
      console.error('Create onboarding document error:', error);
      res.status(500).json({ error: 'Failed to create document' });
    }
  });

  // Update onboarding document (admin)
  app.patch('/api/admin/onboarding/documents/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      const { type, title, description, fileUrl, externalUrl, thumbnailUrl, sortOrder, isRequired, isActive, targetUserType } = req.body;
      
      const [document] = await db.update(onboardingDocuments)
        .set({
          type,
          title,
          description,
          fileUrl,
          externalUrl,
          thumbnailUrl,
          sortOrder,
          isRequired,
          isActive,
          targetUserType,
          updatedAt: new Date()
        })
        .where(eq(onboardingDocuments.id, documentId))
        .returning();
      
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      res.json({ document });
    } catch (error) {
      console.error('Update onboarding document error:', error);
      res.status(500).json({ error: 'Failed to update document' });
    }
  });

  // Delete onboarding document (admin)
  app.delete('/api/admin/onboarding/documents/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      
      await db.delete(onboardingDocuments)
        .where(eq(onboardingDocuments.id, documentId));
      
      res.json({ success: true });
    } catch (error) {
      console.error('Delete onboarding document error:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  // Get all users with their onboarding status (admin)
  app.get('/api/admin/onboarding/users', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        userType: users.userType,
        onboardingCompleted: users.onboardingCompleted,
        partnershipAgreementSignedAt: users.partnershipAgreementSignedAt,
        trainingCompletedAt: users.trainingCompletedAt,
        createdAt: users.createdAt
      })
        .from(users)
        .where(sql`${users.role} = 'user'`)
        .orderBy(desc(users.createdAt));
      
      res.json({ users: allUsers });
    } catch (error) {
      console.error('Get onboarding users error:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  });

  // ==================== LOAN DIGEST NOTIFICATION ROUTES ====================

  // Admin - Get scheduled digests for a specific date
  app.get('/api/admin/digests/scheduled', authenticateUser, requireAdmin, requirePermission('digests.view'), async (req: AuthRequest, res: Response) => {
    try {
      const dateStr = req.query.date as string || format(new Date(), 'yyyy-MM-dd');
      const targetDate = new Date(dateStr + 'T00:00:00');
      const startOfTargetDay = new Date(targetDate);
      startOfTargetDay.setHours(0, 0, 0, 0);
      const endOfTargetDay = new Date(targetDate);
      endOfTargetDay.setHours(23, 59, 59, 999);
      
      // Get all enabled digest configs - support both project-based and deal-only configs
      const configs = await db.select({
        id: loanDigestConfigs.id,
        projectId: loanDigestConfigs.projectId,
        dealId: loanDigestConfigs.dealId,
        frequency: loanDigestConfigs.frequency,
        customDays: loanDigestConfigs.customDays,
        timeOfDay: loanDigestConfigs.timeOfDay,
        timezone: loanDigestConfigs.timezone,
        includeDocumentsNeeded: loanDigestConfigs.includeDocumentsNeeded,
        includeNotes: loanDigestConfigs.includeNotes,
        includeMessages: loanDigestConfigs.includeMessages,
        includeGeneralUpdates: loanDigestConfigs.includeGeneralUpdates,
        emailSubject: loanDigestConfigs.emailSubject,
        emailBody: loanDigestConfigs.emailBody,
        smsBody: loanDigestConfigs.smsBody,
        isEnabled: loanDigestConfigs.isEnabled,
        createdAt: loanDigestConfigs.createdAt,
        projectName: projects.projectName,
        projectStatus: projects.status,
        borrowerName: savedQuotes.customerFirstName,
        propertyAddress: savedQuotes.propertyAddress,
      })
        .from(loanDigestConfigs)
        .leftJoin(projects, eq(loanDigestConfigs.projectId, projects.id))
        .leftJoin(savedQuotes, or(
          eq(projects.quoteId, savedQuotes.id),
          eq(loanDigestConfigs.dealId, savedQuotes.id)
        ))
        .where(eq(loanDigestConfigs.isEnabled, true));
      
      // Helper: check if a digest is scheduled for a given date based on frequency
      const isScheduledForDate = (config: typeof configs[0], date: Date): boolean => {
        const configCreatedDate = new Date(config.createdAt);
        configCreatedDate.setHours(0, 0, 0, 0);
        const targetDateNormalized = new Date(date);
        targetDateNormalized.setHours(0, 0, 0, 0);
        
        // Calculate days since config was created
        const daysSinceCreated = Math.floor((targetDateNormalized.getTime() - configCreatedDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysSinceCreated < 0) return false; // Target date is before config was created
        
        let interval = 1;
        switch (config.frequency) {
          case 'daily': interval = 1; break;
          case 'every_2_days': interval = 2; break;
          case 'every_3_days': interval = 3; break;
          case 'weekly': interval = 7; break;
          case 'custom': interval = Math.max(1, Math.min(30, config.customDays || 2)); break;
          default: interval = 1;
        }
        
        // Check if this date falls on a scheduled interval
        return daysSinceCreated % interval === 0;
      };
      
      // Filter configs that are scheduled for the target date
      const scheduledConfigs = configs.filter(c => isScheduledForDate(c, targetDate));
      
      // AUTO-GENERATE DRAFTS: Create drafts for any configs that don't have one yet
      for (const config of scheduledConfigs) {
        // Check if any drafts exist for this config on this date
        const existingDrafts = await db.select()
          .from(scheduledDigestDrafts)
          .where(and(
            eq(scheduledDigestDrafts.configId, config.id),
            gte(scheduledDigestDrafts.scheduledDate, startOfTargetDay),
            lte(scheduledDigestDrafts.scheduledDate, endOfTargetDay),
            sql`${scheduledDigestDrafts.status} NOT IN ('superseded')`
          ));
        
        if (existingDrafts.length === 0) {
          // Get recipients count for this config
          const recipientCount = await db.select({ count: sql<number>`count(*)` })
            .from(loanDigestRecipients)
            .where(and(
              eq(loanDigestRecipients.configId, config.id),
              eq(loanDigestRecipients.isActive, true)
            ));
          
          if ((recipientCount[0]?.count || 0) > 0) {
            // Auto-create draft
            try {
              await db.insert(scheduledDigestDrafts).values({
                configId: config.id,
                projectId: config.projectId || null,
                scheduledDate: targetDate,
                timeOfDay: config.timeOfDay || '09:00',
                emailSubject: config.emailSubject,
                emailBody: config.emailBody,
                smsBody: config.smsBody,
                documentsCount: 0,
                updatesCount: 0,
                recipients: '[]',
                status: 'draft',
                source: 'digest',
              });
            } catch (e) {
              console.log('Draft already exists or could not be created:', (e as Error).message);
            }
          }
        } else {
          // If there's an AI communication draft, supersede any regular digest draft for same day
          const aiDraft = existingDrafts.find((d: any) => d.source === 'ai_communication' && (d.status === 'draft' || d.status === 'approved'));
          if (aiDraft) {
            const regularDrafts = existingDrafts.filter((d: any) => d.source === 'digest' && (d.status === 'draft' || d.status === 'approved'));
            for (const rd of regularDrafts) {
              await db.update(scheduledDigestDrafts)
                .set({ status: 'superseded', updatedAt: new Date() })
                .where(eq(scheduledDigestDrafts.id, rd.id));
            }
          }
        }
      }
      
      // For each config, get recipients, drafts, and sent history for the target date
      const digestsWithDetails = await Promise.all(scheduledConfigs.map(async (config) => {
        // Get recipients
        const recipients = await db.select({
          id: loanDigestRecipients.id,
          userId: loanDigestRecipients.userId,
          recipientName: loanDigestRecipients.recipientName,
          recipientEmail: loanDigestRecipients.recipientEmail,
          recipientPhone: loanDigestRecipients.recipientPhone,
          deliveryMethod: loanDigestRecipients.deliveryMethod,
          isActive: loanDigestRecipients.isActive,
        })
          .from(loanDigestRecipients)
          .where(and(
            eq(loanDigestRecipients.configId, config.id),
            eq(loanDigestRecipients.isActive, true)
          ));
        
        // Get user names for linked recipients
        const recipientsWithNames = await Promise.all(recipients.map(async (r) => {
          let name = r.recipientName;
          let email = r.recipientEmail;
          let phone = r.recipientPhone;
          if (r.userId) {
            const user = await db.select({ fullName: users.fullName, email: users.email, phone: users.phone })
              .from(users)
              .where(eq(users.id, r.userId))
              .limit(1);
            if (user[0]) {
              name = name || user[0].fullName || null;
              email = email || user[0].email || null;
              phone = phone || user[0].phone || null;
            }
          }
          return {
            id: r.id,
            name,
            email,
            phone,
            deliveryMethod: r.deliveryMethod,
          };
        }));
        
        // Check if a draft exists for this config on this date
        const existingDrafts = await db.select()
          .from(scheduledDigestDrafts)
          .where(and(
            eq(scheduledDigestDrafts.configId, config.id),
            gte(scheduledDigestDrafts.scheduledDate, startOfTargetDay),
            lte(scheduledDigestDrafts.scheduledDate, endOfTargetDay)
          ))
          .limit(1);
        
        const draft = existingDrafts[0] || null;
        
        // Get sent digests for this date
        const sentDigests = await db.select({
          id: digestHistory.id,
          recipientAddress: digestHistory.recipientAddress,
          deliveryMethod: digestHistory.deliveryMethod,
          status: digestHistory.status,
          documentsCount: digestHistory.documentsCount,
          updatesCount: digestHistory.updatesCount,
          sentAt: digestHistory.sentAt,
          errorMessage: digestHistory.errorMessage,
        })
          .from(digestHistory)
          .where(and(
            eq(digestHistory.configId, config.id),
            gte(digestHistory.sentAt, startOfTargetDay),
            lte(digestHistory.sentAt, endOfTargetDay)
          ))
          .orderBy(desc(digestHistory.sentAt));
        
        return {
          configId: config.id,
          projectId: config.projectId,
          dealId: config.dealId,
          projectName: config.projectName || (config.borrowerName ? `${config.borrowerName} - ${config.propertyAddress?.split(',')[0] || 'Deal'}` : `Deal #${config.dealId || config.projectId}`),
          borrowerName: config.borrowerName,
          propertyAddress: config.propertyAddress,
          frequency: config.frequency,
          customDays: config.customDays,
          timeOfDay: config.timeOfDay,
          timezone: config.timezone,
          recipientCount: recipientsWithNames.length,
          recipients: recipientsWithNames,
          contentSettings: {
            includeDocumentsNeeded: config.includeDocumentsNeeded,
            includeNotes: config.includeNotes,
            includeMessages: config.includeMessages,
            includeGeneralUpdates: config.includeGeneralUpdates,
          },
          defaultContent: {
            emailSubject: config.emailSubject,
            emailBody: config.emailBody,
            smsBody: config.smsBody,
          },
          draft: draft ? {
            id: draft.id,
            status: draft.status,
            emailSubject: draft.emailSubject,
            emailBody: draft.emailBody,
            smsBody: draft.smsBody,
            documentsCount: draft.documentsCount,
            updatesCount: draft.updatesCount,
            approvedBy: draft.approvedBy,
            approvedAt: draft.approvedAt?.toISOString() || null,
            sentAt: draft.sentAt?.toISOString() || null,
            source: (draft as any).source || 'digest',
            sourceCommId: (draft as any).sourceCommId || null,
          } : null,
          sentDigests: sentDigests.map(s => ({
            ...s,
            sentAt: s.sentAt?.toISOString() || new Date().toISOString(),
          })),
        };
      }));
      
      // Filter to only show digests with recipients
      const filteredDigests = digestsWithDetails.filter(d => d.recipientCount > 0);
      
      // Sort by time of day
      filteredDigests.sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay));
      
      res.json({
        date: dateStr,
        digests: filteredDigests,
      });
    } catch (error) {
      console.error('Error fetching scheduled digests:', error);
      res.status(500).json({ error: 'Failed to fetch scheduled digests' });
    }
  });

  // ==================== DIGEST TEMPLATES ====================

  // Get all digest templates
  app.get('/api/admin/digest-templates', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templates = await db.select()
        .from(digestTemplates)
        .orderBy(desc(digestTemplates.isDefault), desc(digestTemplates.createdAt));
      
      res.json({ templates });
    } catch (error: any) {
      console.error('Get digest templates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new digest template
  app.post('/api/admin/digest-templates', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1, "Name is required").max(100),
        description: z.string().max(255).optional().nullable(),
        emailSubject: z.string().min(1, "Email subject is required").max(255),
        emailBody: z.string().min(1, "Email body is required"),
        smsBody: z.string().optional().nullable(),
        isDefault: z.boolean().optional(),
      });
      
      const validated = schema.parse(req.body);
      
      // If setting as default, unset other defaults
      if (validated.isDefault) {
        await db.update(digestTemplates)
          .set({ isDefault: false })
          .where(eq(digestTemplates.isDefault, true));
      }
      
      const result = await db.insert(digestTemplates)
        .values({
          name: validated.name,
          description: validated.description,
          emailSubject: validated.emailSubject,
          emailBody: validated.emailBody,
          smsBody: validated.smsBody,
          isDefault: validated.isDefault || false,
          createdBy: req.user?.id,
        })
        .returning();
      
      res.json({ template: result[0] });
    } catch (error: any) {
      console.error('Create digest template error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Update a digest template
  app.put('/api/admin/digest-templates/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: 'Invalid template ID' });
      }
      
      const schema = z.object({
        name: z.string().min(1, "Name is required").max(100),
        description: z.string().max(255).optional().nullable(),
        emailSubject: z.string().min(1, "Email subject is required").max(255),
        emailBody: z.string().min(1, "Email body is required"),
        smsBody: z.string().optional().nullable(),
        isDefault: z.boolean().optional(),
      });
      
      const validated = schema.parse(req.body);
      
      // If setting as default, unset other defaults
      if (validated.isDefault) {
        await db.update(digestTemplates)
          .set({ isDefault: false })
          .where(eq(digestTemplates.isDefault, true));
      }
      
      const result = await db.update(digestTemplates)
        .set({
          name: validated.name,
          description: validated.description,
          emailSubject: validated.emailSubject,
          emailBody: validated.emailBody,
          smsBody: validated.smsBody,
          isDefault: validated.isDefault || false,
          updatedAt: new Date(),
        })
        .where(eq(digestTemplates.id, templateId))
        .returning();
      
      if (!result[0]) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      res.json({ template: result[0] });
    } catch (error: any) {
      console.error('Update digest template error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a digest template
  app.delete('/api/admin/digest-templates/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: 'Invalid template ID' });
      }
      
      // Check if template exists
      const [existing] = await db.select()
        .from(digestTemplates)
        .where(eq(digestTemplates.id, templateId))
        .limit(1);
      
      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      // Don't allow deleting the only default template
      if (existing.isDefault) {
        const otherTemplates = await db.select()
          .from(digestTemplates)
          .where(sql`${digestTemplates.id} != ${templateId}`)
          .limit(1);
        
        if (otherTemplates.length > 0) {
          // Set another template as default
          await db.update(digestTemplates)
            .set({ isDefault: true })
            .where(eq(digestTemplates.id, otherTemplates[0].id));
        }
      }
      
      await db.delete(digestTemplates).where(eq(digestTemplates.id, templateId));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete digest template error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Preview a template with populated merge tags
  app.post('/api/admin/digest-templates/preview', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        emailSubject: z.string().optional().nullable(),
        emailBody: z.string().optional().nullable(),
        smsBody: z.string().optional().nullable(),
        configId: z.number().optional().nullable(),
        projectId: z.number().optional().nullable(),
        dealId: z.number().optional().nullable(),
      });
      
      const validated = schema.parse(req.body);
      const { emailSubject, emailBody, smsBody, configId, projectId, dealId } = validated;
      
      // Get real data for preview
      let recipientName = 'John Smith';
      let propertyAddress = '123 Main Street, City, ST 12345';
      let documentsSection = '';
      let updatesSection = '';
      let documentsCount = 0;
      let portalLink = process.env.BASE_URL || 'https://app.lendry.ai';
      
      // Try to get real data from project or deal
      if (projectId) {
        const [project] = await db.select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        
        if (project) {
          portalLink = `${process.env.BASE_URL || 'https://app.lendry.ai'}/portal/${project.borrowerToken}`;
          
          // Get quote for property info
          if (project.quoteId) {
            const [quote] = await db.select()
              .from(savedQuotes)
              .where(eq(savedQuotes.id, project.quoteId))
              .limit(1);
            
            if (quote) {
              recipientName = `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim() || recipientName;
              propertyAddress = quote.propertyAddress || propertyAddress;
            }
          }
          
          // Get outstanding documents
          const docs = await getOutstandingDocuments(projectId);
          documentsCount = docs.length;
          if (docs.length > 0) {
            documentsSection = `Documents Needed (${docs.length}):\n` + 
              docs.slice(0, 5).map((d: any) => `• ${d.name || d.documentName}`).join('\n') +
              (docs.length > 5 ? `\n• ...and ${docs.length - 5} more` : '');
          } else {
            documentsSection = 'All documents received - thank you!';
          }
          
          // Get recent updates
          const updates = await getRecentUpdates(projectId);
          if (updates.length > 0) {
            updatesSection = 'Recent Updates:\n' + 
              updates.slice(0, 3).map((u: any) => `• ${u.description}`).join('\n');
          } else {
            updatesSection = 'No recent updates.';
          }
        }
      } else if (dealId) {
        const [quote] = await db.select()
          .from(savedQuotes)
          .where(eq(savedQuotes.id, dealId))
          .limit(1);
        
        if (quote) {
          recipientName = `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim() || recipientName;
          propertyAddress = quote.propertyAddress || propertyAddress;
        }
        
        documentsSection = 'Documents Needed:\n• Proof of Income\n• Bank Statements\n• Property Insurance';
        documentsCount = 3;
        updatesSection = 'Your loan application is being processed.';
      }
      
      // Replace merge tags
      const replaceTags = (text: string | null) => {
        if (!text) return '';
        return text
          .replace(/\{\{recipientName\}\}/g, recipientName)
          .replace(/\{\{propertyAddress\}\}/g, propertyAddress)
          .replace(/\{\{documentsSection\}\}/g, documentsSection)
          .replace(/\{\{updatesSection\}\}/g, updatesSection)
          .replace(/\{\{documentsCount\}\}/g, String(documentsCount))
          .replace(/\{\{portalLink\}\}/g, portalLink);
      };
      
      res.json({
        preview: {
          emailSubject: replaceTags(emailSubject),
          emailBody: replaceTags(emailBody),
          smsBody: replaceTags(smsBody),
        },
        data: {
          recipientName,
          propertyAddress,
          documentsCount,
          portalLink,
        }
      });
    } catch (error: any) {
      console.error('Preview template error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin - Generate drafts for a specific date
  app.post('/api/admin/digests/generate-drafts', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { date } = req.body;
      const dateStr = date || format(new Date(), 'yyyy-MM-dd');
      const targetDate = new Date(dateStr + 'T12:00:00'); // noon to avoid timezone issues
      const startOfTargetDay = new Date(targetDate);
      startOfTargetDay.setHours(0, 0, 0, 0);
      const endOfTargetDay = new Date(targetDate);
      endOfTargetDay.setHours(23, 59, 59, 999);
      
      // Get all enabled digest configs (support both project-based and deal-only)
      const configs = await db.select({
        id: loanDigestConfigs.id,
        projectId: loanDigestConfigs.projectId,
        dealId: loanDigestConfigs.dealId,
        frequency: loanDigestConfigs.frequency,
        customDays: loanDigestConfigs.customDays,
        timeOfDay: loanDigestConfigs.timeOfDay,
        emailSubject: loanDigestConfigs.emailSubject,
        emailBody: loanDigestConfigs.emailBody,
        smsBody: loanDigestConfigs.smsBody,
        createdAt: loanDigestConfigs.createdAt,
      })
        .from(loanDigestConfigs)
        .leftJoin(projects, eq(loanDigestConfigs.projectId, projects.id))
        .where(and(
          eq(loanDigestConfigs.isEnabled, true),
          or(isNull(projects.id), eq(projects.status, 'active'))
        ));
      
      // Helper: check if scheduled
      const isScheduledForDate = (config: typeof configs[0], date: Date): boolean => {
        const configCreatedDate = new Date(config.createdAt);
        configCreatedDate.setHours(0, 0, 0, 0);
        const targetDateNormalized = new Date(date);
        targetDateNormalized.setHours(0, 0, 0, 0);
        const daysSinceCreated = Math.floor((targetDateNormalized.getTime() - configCreatedDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceCreated < 0) return false;
        let interval = 1;
        switch (config.frequency) {
          case 'daily': interval = 1; break;
          case 'every_2_days': interval = 2; break;
          case 'every_3_days': interval = 3; break;
          case 'weekly': interval = 7; break;
          case 'custom': interval = Math.max(1, Math.min(30, config.customDays || 2)); break;
          default: interval = 1;
        }
        return daysSinceCreated % interval === 0;
      };
      
      const scheduledConfigs = configs.filter(c => isScheduledForDate(c, targetDate));
      let draftsCreated = 0;
      
      for (const config of scheduledConfigs) {
        // Check if draft already exists
        const existingDraft = await db.select()
          .from(scheduledDigestDrafts)
          .where(and(
            eq(scheduledDigestDrafts.configId, config.id),
            gte(scheduledDigestDrafts.scheduledDate, startOfTargetDay),
            lte(scheduledDigestDrafts.scheduledDate, endOfTargetDay)
          ))
          .limit(1);
        
        if (existingDraft.length > 0) continue; // Already exists
        
        // Get recipients for snapshot
        const recipients = await db.select({
          id: loanDigestRecipients.id,
          recipientName: loanDigestRecipients.recipientName,
          recipientEmail: loanDigestRecipients.recipientEmail,
          recipientPhone: loanDigestRecipients.recipientPhone,
          deliveryMethod: loanDigestRecipients.deliveryMethod,
          userId: loanDigestRecipients.userId,
        })
          .from(loanDigestRecipients)
          .where(and(
            eq(loanDigestRecipients.configId, config.id),
            eq(loanDigestRecipients.isActive, true)
          ));
        
        if (recipients.length === 0) continue;
        
        // Get content counts
        const outstandingDocs = await getOutstandingDocuments(config.projectId!);
        const recentUpdates = await getRecentUpdates(config.projectId!);
        
        // Create draft
        await db.insert(scheduledDigestDrafts).values({
          configId: config.id,
          projectId: config.projectId!,
          scheduledDate: targetDate,
          timeOfDay: config.timeOfDay,
          emailSubject: config.emailSubject,
          emailBody: config.emailBody,
          smsBody: config.smsBody,
          documentsCount: outstandingDocs.length,
          updatesCount: recentUpdates.length,
          recipients: JSON.stringify(recipients),
          status: 'draft',
        });
        
        draftsCreated++;
      }
      
      res.json({ 
        success: true, 
        draftsCreated,
        message: `Generated ${draftsCreated} draft(s) for ${dateStr}`
      });
    } catch (error) {
      console.error('Error generating drafts:', error);
      res.status(500).json({ error: 'Failed to generate drafts' });
    }
  });

  // Admin - Update a draft and optionally its config
  app.put('/api/admin/digests/drafts/:draftId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const draftId = parseInt(req.params.draftId);
      const { emailSubject, emailBody, smsBody, frequency, customDays, timeOfDay, configId } = req.body;
      
      // Update the draft content
      const [updated] = await db.update(scheduledDigestDrafts)
        .set({
          emailSubject,
          emailBody,
          smsBody,
          updatedAt: new Date(),
        })
        .where(eq(scheduledDigestDrafts.id, draftId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Draft not found' });
      }
      
      // If config settings provided, update the config as well
      if (configId && (frequency || timeOfDay)) {
        const configUpdate: any = { updatedAt: new Date() };
        if (frequency) configUpdate.frequency = frequency;
        if (frequency === 'custom' && customDays) configUpdate.customDays = customDays;
        if (timeOfDay) configUpdate.timeOfDay = timeOfDay;
        
        await db.update(loanDigestConfigs)
          .set(configUpdate)
          .where(eq(loanDigestConfigs.id, configId));
      }
      
      res.json({ success: true, draft: updated });
    } catch (error) {
      console.error('Error updating draft:', error);
      res.status(500).json({ error: 'Failed to update draft' });
    }
  });

  // Admin - Approve a draft
  app.post('/api/admin/digests/drafts/:draftId/approve', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const draftId = parseInt(req.params.draftId);
      
      const [updated] = await db.update(scheduledDigestDrafts)
        .set({
          status: 'approved',
          approvedBy: req.user!.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scheduledDigestDrafts.id, draftId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      if (updated.projectId) {
        try {
          const existing = await db.select({ id: dealMemoryEntries.id }).from(dealMemoryEntries)
            .where(and(eq(dealMemoryEntries.dealId, updated.projectId), eq(dealMemoryEntries.entryType, 'digest_approved'), sql`metadata->>'draftId' = ${String(updated.id)}`))
            .limit(1);
          if (existing.length === 0) {
            await db.insert(dealMemoryEntries).values({
              dealId: updated.projectId,
              entryType: 'digest_approved',
              title: `Digest approved: ${updated.emailSubject || 'Loan Update'}`,
              description: `Scheduled for ${new Date(updated.scheduledDate).toLocaleDateString()} at ${updated.timeOfDay}`,
              sourceType: 'admin',
              sourceUserId: req.user!.id,
              metadata: { draftId: updated.id },
            });
          }
        } catch (e) { console.error('Memory entry error:', e); }
      }
      
      res.json({ success: true, draft: updated });
    } catch (error) {
      console.error('Error approving draft:', error);
      res.status(500).json({ error: 'Failed to approve draft' });
    }
  });

  // Admin - Skip a draft (don't send)
  app.post('/api/admin/digests/drafts/:draftId/skip', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const draftId = parseInt(req.params.draftId);
      
      const [updated] = await db.update(scheduledDigestDrafts)
        .set({
          status: 'skipped',
          updatedAt: new Date(),
        })
        .where(eq(scheduledDigestDrafts.id, draftId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      if (updated.projectId) {
        try {
          const existing = await db.select({ id: dealMemoryEntries.id }).from(dealMemoryEntries)
            .where(and(eq(dealMemoryEntries.dealId, updated.projectId), eq(dealMemoryEntries.entryType, 'digest_skipped'), sql`metadata->>'draftId' = ${String(updated.id)}`))
            .limit(1);
          if (existing.length === 0) {
            await db.insert(dealMemoryEntries).values({
              dealId: updated.projectId,
              entryType: 'digest_skipped',
              title: `Digest skipped: ${updated.emailSubject || 'Loan Update'}`,
              description: `Was scheduled for ${new Date(updated.scheduledDate).toLocaleDateString()}`,
              sourceType: 'admin',
              sourceUserId: req.user!.id,
              metadata: { draftId: updated.id },
            });
          }
        } catch (e) { console.error('Memory entry error:', e); }
      }
      
      res.json({ success: true, draft: updated });
    } catch (error) {
      console.error('Error skipping draft:', error);
      res.status(500).json({ error: 'Failed to skip draft' });
    }
  });

  // Admin - Bulk approve drafts
  app.post('/api/admin/digests/drafts/bulk-approve', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { draftIds } = req.body;
      
      if (!Array.isArray(draftIds) || draftIds.length === 0) {
        return res.status(400).json({ error: 'draftIds must be a non-empty array' });
      }
      
      const updated = await db.update(scheduledDigestDrafts)
        .set({
          status: 'approved',
          approvedBy: req.user!.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(scheduledDigestDrafts.id, draftIds))
        .returning();
      
      res.json({ success: true, count: updated.length, drafts: updated });
    } catch (error) {
      console.error('Error bulk approving drafts:', error);
      res.status(500).json({ error: 'Failed to bulk approve drafts' });
    }
  });

  // Admin - Bulk skip drafts
  app.post('/api/admin/digests/drafts/bulk-skip', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { draftIds } = req.body;
      
      if (!Array.isArray(draftIds) || draftIds.length === 0) {
        return res.status(400).json({ error: 'draftIds must be a non-empty array' });
      }
      
      const updated = await db.update(scheduledDigestDrafts)
        .set({
          status: 'skipped',
          updatedAt: new Date(),
        })
        .where(inArray(scheduledDigestDrafts.id, draftIds))
        .returning();
      
      res.json({ success: true, count: updated.length, drafts: updated });
    } catch (error) {
      console.error('Error bulk skipping drafts:', error);
      res.status(500).json({ error: 'Failed to bulk skip drafts' });
    }
  });

  // Admin - Send an approved draft now
  app.post('/api/admin/digests/drafts/:draftId/send', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const draftId = parseInt(req.params.draftId);
      
      // Get the draft
      const [draft] = await db.select()
        .from(scheduledDigestDrafts)
        .where(eq(scheduledDigestDrafts.id, draftId))
        .limit(1);
      
      if (!draft) {
        return res.status(404).json({ error: 'Draft not found' });
      }
      
      if (draft.status !== 'approved') {
        return res.status(400).json({ error: 'Draft must be approved before sending' });
      }
      
      // Get project info
      const [project] = await db.select()
        .from(projects)
        .where(eq(projects.id, draft.projectId))
        .limit(1);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Parse recipients
      const recipients = JSON.parse(draft.recipients as string || '[]');
      let emailsSent = 0;
      let smsSent = 0;
      
      // Send to each recipient
      for (const recipient of recipients) {
        const recipientName = recipient.recipientName || 'Borrower';
        const email = recipient.recipientEmail;
        const phone = recipient.recipientPhone;
        
        // Replace placeholders in content
        const emailSubject = (draft.emailSubject || 'Loan Update').replace(/\{\{recipientName\}\}/g, recipientName);
        const emailBody = (draft.emailBody || '')
          .replace(/\{\{recipientName\}\}/g, recipientName)
          .replace(/\{\{documentsCount\}\}/g, String(draft.documentsCount));
        const smsBody = (draft.smsBody || '')
          .replace(/\{\{recipientName\}\}/g, recipientName)
          .replace(/\{\{documentsCount\}\}/g, String(draft.documentsCount));
        
        // Send email
        if (email && (recipient.deliveryMethod === 'email' || recipient.deliveryMethod === 'both')) {
          try {
            const { Resend } = await import('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);
            await resend.emails.send({
              from: 'Lendry.AI <no-reply@lendry.ai>',
              to: email,
              subject: emailSubject,
              html: emailBody.replace(/\n/g, '<br>'),
            });
            emailsSent++;
            
            // Log to history
            await db.insert(digestHistory).values({
              configId: draft.configId,
              recipientId: recipient.id,
              projectId: draft.projectId,
              deliveryMethod: 'email',
              recipientAddress: email,
              documentsCount: draft.documentsCount,
              updatesCount: draft.updatesCount,
              status: 'sent',
            });
          } catch (err) {
            console.error('Email send error:', err);
          }
        }
        
        // Send SMS
        if (phone && (recipient.deliveryMethod === 'sms' || recipient.deliveryMethod === 'both')) {
          try {
            const twilio = await import('twilio');
            const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            await client.messages.create({
              body: smsBody,
              from: process.env.TWILIO_PHONE_NUMBER,
              to: phone,
            });
            smsSent++;
            
            // Log to history
            await db.insert(digestHistory).values({
              configId: draft.configId,
              recipientId: recipient.id,
              projectId: draft.projectId,
              deliveryMethod: 'sms',
              recipientAddress: phone,
              documentsCount: draft.documentsCount,
              updatesCount: draft.updatesCount,
              status: 'sent',
            });
          } catch (err) {
            console.error('SMS send error:', err);
          }
        }
      }
      
      // Mark draft as sent
      await db.update(scheduledDigestDrafts)
        .set({
          status: 'sent',
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scheduledDigestDrafts.id, draftId));
      
      res.json({ 
        success: true, 
        emailsSent, 
        smsSent,
        message: `Sent ${emailsSent} email(s) and ${smsSent} SMS message(s)`
      });
    } catch (error) {
      console.error('Error sending draft:', error);
      res.status(500).json({ error: 'Failed to send draft' });
    }
  });

  // Cron endpoint - runs digest job (should be called by external scheduler)
  app.post('/api/cron/digests', async (req: Request, res: Response) => {
    try {
      // Simple API key auth for cron
      const cronKey = req.headers['x-cron-key'];
      const expectedKey = process.env.CRON_SECRET_KEY;
      if (!expectedKey) {
        console.error('CRON_SECRET_KEY env var not set. Cron endpoint disabled.');
        return res.status(503).json({ error: 'Cron endpoint not configured' });
      }
      
      if (cronKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      // NEW: Only send approved drafts for today - no auto-sending
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);
      
      // STEP 1: Auto-generate drafts for today if they don't exist
      // Get all enabled configs that are scheduled for today
      const allConfigs = await db.select({
        id: loanDigestConfigs.id,
        projectId: loanDigestConfigs.projectId,
        frequency: loanDigestConfigs.frequency,
        customDays: loanDigestConfigs.customDays,
        timeOfDay: loanDigestConfigs.timeOfDay,
        emailSubject: loanDigestConfigs.emailSubject,
        emailBody: loanDigestConfigs.emailBody,
        smsBody: loanDigestConfigs.smsBody,
        createdAt: loanDigestConfigs.createdAt,
      })
        .from(loanDigestConfigs)
        .innerJoin(projects, eq(loanDigestConfigs.projectId, projects.id))
        .where(and(
          eq(loanDigestConfigs.isEnabled, true),
          eq(projects.status, 'active')
        ));
      
      // Helper: check if scheduled for today
      const isScheduledForToday = (config: typeof allConfigs[0]): boolean => {
        const configCreatedDate = new Date(config.createdAt);
        configCreatedDate.setHours(0, 0, 0, 0);
        const todayNormalized = new Date(today);
        todayNormalized.setHours(0, 0, 0, 0);
        const daysSinceCreated = Math.floor((todayNormalized.getTime() - configCreatedDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceCreated < 0) return false;
        let interval = 1;
        switch (config.frequency) {
          case 'daily': interval = 1; break;
          case 'every_2_days': interval = 2; break;
          case 'every_3_days': interval = 3; break;
          case 'weekly': interval = 7; break;
          case 'custom': interval = Math.max(1, Math.min(30, config.customDays || 2)); break;
          default: interval = 1;
        }
        return daysSinceCreated % interval === 0;
      };
      
      const scheduledConfigs = allConfigs.filter(isScheduledForToday);
      let draftsGenerated = 0;
      
      for (const config of scheduledConfigs) {
        // Check if draft already exists for today
        const existingDraft = await db.select()
          .from(scheduledDigestDrafts)
          .where(and(
            eq(scheduledDigestDrafts.configId, config.id),
            gte(scheduledDigestDrafts.scheduledDate, startOfDay),
            lte(scheduledDigestDrafts.scheduledDate, endOfDay)
          ))
          .limit(1);
        
        if (existingDraft.length > 0) continue;
        
        // Get recipients for snapshot
        const recipients = await db.select({
          id: loanDigestRecipients.id,
          recipientName: loanDigestRecipients.recipientName,
          recipientEmail: loanDigestRecipients.recipientEmail,
          recipientPhone: loanDigestRecipients.recipientPhone,
          deliveryMethod: loanDigestRecipients.deliveryMethod,
          userId: loanDigestRecipients.userId,
        })
          .from(loanDigestRecipients)
          .where(and(
            eq(loanDigestRecipients.configId, config.id),
            eq(loanDigestRecipients.isActive, true)
          ));
        
        if (recipients.length === 0) continue;
        
        // Get content counts
        const outstandingDocs = await getOutstandingDocuments(config.projectId!);
        const recentUpdates = await getRecentUpdates(config.projectId!);
        
        // Create draft
        await db.insert(scheduledDigestDrafts).values({
          configId: config.id,
          projectId: config.projectId!,
          scheduledDate: today,
          timeOfDay: config.timeOfDay,
          emailSubject: config.emailSubject,
          emailBody: config.emailBody,
          smsBody: config.smsBody,
          documentsCount: outstandingDocs.length,
          updatesCount: recentUpdates.length,
          recipients: JSON.stringify(recipients),
          status: 'draft',
        });
        
        draftsGenerated++;
      }
      
      console.log(`Auto-generated ${draftsGenerated} draft(s) for today`);
      
      // STEP 2: Find approved drafts for today that haven't been sent
      const approvedDrafts = await db.select()
        .from(scheduledDigestDrafts)
        .where(and(
          eq(scheduledDigestDrafts.status, 'approved'),
          gte(scheduledDigestDrafts.scheduledDate, startOfDay),
          lte(scheduledDigestDrafts.scheduledDate, endOfDay)
        ));
      
      let processed = 0;
      let skipped = 0;
      let errors: string[] = [];
      const now = new Date();
      
      for (const draft of approvedDrafts) {
        // Check if scheduled time has passed (only send at or after scheduled time)
        const [hours, minutes] = draft.timeOfDay.split(':').map(Number);
        const scheduledTime = new Date(today);
        scheduledTime.setHours(hours || 9, minutes || 0, 0, 0);
        
        if (now < scheduledTime) {
          skipped++; // Not yet time to send
          continue;
        }
        try {
          // Get project info
          const [project] = await db.select()
            .from(projects)
            .where(eq(projects.id, draft.projectId))
            .limit(1);
          
          if (!project) continue;
          
          // Parse recipients
          const recipients = JSON.parse(draft.recipients as string || '[]');
          
          // Send to each recipient
          for (const recipient of recipients) {
            const recipientName = recipient.recipientName || 'Borrower';
            const email = recipient.recipientEmail;
            const phone = recipient.recipientPhone;
            
            // Replace placeholders in content
            const emailSubject = (draft.emailSubject || 'Loan Update').replace(/\{\{recipientName\}\}/g, recipientName);
            const emailBody = (draft.emailBody || '')
              .replace(/\{\{recipientName\}\}/g, recipientName)
              .replace(/\{\{documentsCount\}\}/g, String(draft.documentsCount));
            const smsBody = (draft.smsBody || '')
              .replace(/\{\{recipientName\}\}/g, recipientName)
              .replace(/\{\{documentsCount\}\}/g, String(draft.documentsCount));
            
            // Send email
            if (email && (recipient.deliveryMethod === 'email' || recipient.deliveryMethod === 'both')) {
              try {
                const { Resend } = await import('resend');
                const resend = new Resend(process.env.RESEND_API_KEY);
                await resend.emails.send({
                  from: 'Lendry.AI <no-reply@lendry.ai>',
                  to: email,
                  subject: emailSubject,
                  html: emailBody.replace(/\n/g, '<br>'),
                });
                
                // Log to history
                await db.insert(digestHistory).values({
                  configId: draft.configId,
                  recipientId: recipient.id,
                  projectId: draft.projectId,
                  deliveryMethod: 'email',
                  recipientAddress: email,
                  documentsCount: draft.documentsCount,
                  updatesCount: draft.updatesCount,
                  status: 'sent',
                });
              } catch (err) {
                console.error('Cron email error:', err);
              }
            }
            
            // Send SMS
            if (phone && (recipient.deliveryMethod === 'sms' || recipient.deliveryMethod === 'both')) {
              try {
                const twilio = await import('twilio');
                const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                await client.messages.create({
                  body: smsBody,
                  from: process.env.TWILIO_PHONE_NUMBER,
                  to: phone,
                });
                
                // Log to history
                await db.insert(digestHistory).values({
                  configId: draft.configId,
                  recipientId: recipient.id,
                  projectId: draft.projectId,
                  deliveryMethod: 'sms',
                  recipientAddress: phone,
                  documentsCount: draft.documentsCount,
                  updatesCount: draft.updatesCount,
                  status: 'sent',
                });
              } catch (err) {
                console.error('Cron SMS error:', err);
              }
            }
          }
          
          // Mark draft as sent
          await db.update(scheduledDigestDrafts)
            .set({
              status: 'sent',
              sentAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(scheduledDigestDrafts.id, draft.id));

          if (draft.projectId) {
            try {
              await db.insert(dealMemoryEntries).values({
                dealId: draft.projectId,
                entryType: 'digest_sent',
                title: `Digest sent: ${draft.emailSubject || 'Loan Update'}`,
                description: `Delivered to ${JSON.parse(draft.recipients as string || '[]').length} recipient(s) (${draft.documentsCount} docs, ${draft.updatesCount} updates)`,
                sourceType: 'system',
                metadata: { draftId: draft.id, status: 'sent' },
              });
            } catch (e) { console.error('Memory entry error:', e); }
          }
          
          processed++;
        } catch (err: any) {
          errors.push(`Draft ${draft.id}: ${err.message}`);
        }
      }
      
      res.json({ 
        success: true, 
        draftsGenerated,
        processed,
        skipped,
        errors,
        message: `Generated ${draftsGenerated} draft(s), sent ${processed} approved digest(s), ${skipped} scheduled for later` 
      });
    } catch (error: any) {
      console.error('Cron digest error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get digest config for a project
  app.get('/api/projects/:projectId/digest', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.projectId, projectId));
      
      if (!config[0]) {
        return res.json({ config: null, recipients: [] });
      }
      
      const recipients = await db
        .select()
        .from(loanDigestRecipients)
        .where(eq(loanDigestRecipients.configId, config[0].id));
      
      res.json({ config: config[0], recipients });
    } catch (error: any) {
      console.error('Get digest config error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create or update digest config for a project
  app.post('/api/projects/:projectId/digest', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { 
        frequency, 
        customDays, 
        timeOfDay, 
        timezone,
        includeDocumentsNeeded,
        includeNotes,
        includeMessages,
        includeGeneralUpdates,
        isEnabled 
      } = req.body;
      
      // Check if config exists
      const existing = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.projectId, projectId));
      
      let configId: number;
      
      if (existing[0]) {
        // Update existing
        await db
          .update(loanDigestConfigs)
          .set({
            frequency: frequency || existing[0].frequency,
            customDays: customDays !== undefined ? customDays : existing[0].customDays,
            timeOfDay: timeOfDay || existing[0].timeOfDay,
            timezone: timezone || existing[0].timezone,
            includeDocumentsNeeded: includeDocumentsNeeded !== undefined ? includeDocumentsNeeded : existing[0].includeDocumentsNeeded,
            includeNotes: includeNotes !== undefined ? includeNotes : existing[0].includeNotes,
            includeMessages: includeMessages !== undefined ? includeMessages : existing[0].includeMessages,
            includeGeneralUpdates: includeGeneralUpdates !== undefined ? includeGeneralUpdates : existing[0].includeGeneralUpdates,
            isEnabled: isEnabled !== undefined ? isEnabled : existing[0].isEnabled,
            updatedAt: new Date(),
          })
          .where(eq(loanDigestConfigs.id, existing[0].id));
        
        configId = existing[0].id;
      } else {
        // Create new
        const result = await db
          .insert(loanDigestConfigs)
          .values({
            projectId,
            frequency: frequency || 'daily',
            customDays,
            timeOfDay: timeOfDay || '09:00',
            timezone: timezone || 'America/New_York',
            includeDocumentsNeeded: includeDocumentsNeeded !== undefined ? includeDocumentsNeeded : true,
            includeNotes: includeNotes !== undefined ? includeNotes : false,
            includeMessages: includeMessages !== undefined ? includeMessages : false,
            includeGeneralUpdates: includeGeneralUpdates !== undefined ? includeGeneralUpdates : true,
            isEnabled: isEnabled !== undefined ? isEnabled : true,
            createdBy: req.user?.id,
          })
          .returning({ id: loanDigestConfigs.id });
        
        configId = result[0].id;
      }
      
      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.id, configId));
      
      res.json({ config: config[0] });
    } catch (error: any) {
      console.error('Save digest config error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add a recipient to digest config
  app.post('/api/projects/:projectId/digest/recipients', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { userId, recipientName, recipientEmail, recipientPhone, deliveryMethod } = req.body;
      
      // Get config for this project
      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.projectId, projectId));
      
      if (!config[0]) {
        return res.status(400).json({ error: 'Digest config not found. Create config first.' });
      }
      
      // Validate delivery method vs contact info
      if ((deliveryMethod === 'email' || deliveryMethod === 'both') && !recipientEmail && !userId) {
        return res.status(400).json({ error: 'Email is required for email delivery' });
      }
      if ((deliveryMethod === 'sms' || deliveryMethod === 'both') && !recipientPhone && !userId) {
        return res.status(400).json({ error: 'Phone number is required for SMS delivery' });
      }
      
      const result = await db
        .insert(loanDigestRecipients)
        .values({
          configId: config[0].id,
          userId: userId || null,
          recipientName: recipientName || null,
          recipientEmail: recipientEmail || null,
          recipientPhone: recipientPhone || null,
          deliveryMethod: deliveryMethod || 'email',
          isActive: true,
        })
        .returning();
      
      res.json({ recipient: result[0] });
    } catch (error: any) {
      console.error('Add digest recipient error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update a recipient
  app.put('/api/digest/recipients/:recipientId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const recipientId = parseInt(req.params.recipientId);
      const { recipientName, recipientEmail, recipientPhone, deliveryMethod, isActive } = req.body;
      
      await db
        .update(loanDigestRecipients)
        .set({
          recipientName: recipientName !== undefined ? recipientName : undefined,
          recipientEmail: recipientEmail !== undefined ? recipientEmail : undefined,
          recipientPhone: recipientPhone !== undefined ? recipientPhone : undefined,
          deliveryMethod: deliveryMethod !== undefined ? deliveryMethod : undefined,
          isActive: isActive !== undefined ? isActive : undefined,
        })
        .where(eq(loanDigestRecipients.id, recipientId));
      
      const updated = await db
        .select()
        .from(loanDigestRecipients)
        .where(eq(loanDigestRecipients.id, recipientId));
      
      res.json({ recipient: updated[0] });
    } catch (error: any) {
      console.error('Update digest recipient error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a recipient
  app.delete('/api/digest/recipients/:recipientId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const recipientId = parseInt(req.params.recipientId);
      
      await db
        .delete(loanDigestRecipients)
        .where(eq(loanDigestRecipients.id, recipientId));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete digest recipient error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send a test digest
  app.post('/api/projects/:projectId/digest/test', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { recipientId } = req.body;
      
      // Get config
      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.projectId, projectId));
      
      if (!config[0]) {
        return res.status(400).json({ error: 'Digest config not found' });
      }
      
      const result = await sendTestDigest(config[0].id, recipientId);
      
      if (result.success) {
        res.json({ success: true, message: 'Test digest sent successfully' });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error: any) {
      console.error('Send test digest error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get digest history for a project
  app.get('/api/projects/:projectId/digest/history', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      const history = await db
        .select()
        .from(digestHistory)
        .where(eq(digestHistory.projectId, projectId))
        .orderBy(desc(digestHistory.sentAt))
        .limit(50);
      
      res.json({ history });
    } catch (error: any) {
      console.error('Get digest history error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get loan updates for a project
  app.get('/api/projects/:projectId/updates', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      const updates = await getRecentUpdates(projectId);
      
      res.json({ updates });
    } catch (error: any) {
      console.error('Get loan updates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get outstanding documents for a project (for digest preview)
  app.get('/api/projects/:projectId/outstanding-docs', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      const docs = await getOutstandingDocuments(projectId);
      
      res.json({ documents: docs });
    } catch (error: any) {
      console.error('Get outstanding docs error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get users for recipient dropdown (borrowers and partners related to project)
  app.get('/api/projects/:projectId/potential-recipients', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      
      // Get project to find associated users
      const project = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));
      
      if (!project[0]) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Get project owner and any borrower by email
      const potentialRecipients = [];
      
      // Project owner (partner/broker)
      if (project[0].userId) {
        const owner = await db.select().from(users).where(eq(users.id, project[0].userId));
        if (owner[0]) {
          potentialRecipients.push({
            userId: owner[0].id,
            name: owner[0].fullName || owner[0].email,
            email: owner[0].email,
            phone: owner[0].phone,
            role: 'Partner',
          });
        }
      }
      
      // Look for borrower by email
      if (project[0].borrowerEmail) {
        const borrower = await db
          .select()
          .from(users)
          .where(eq(users.email, project[0].borrowerEmail));
        
        if (borrower[0]) {
          potentialRecipients.push({
            userId: borrower[0].id,
            name: borrower[0].fullName || borrower[0].email,
            email: borrower[0].email,
            phone: borrower[0].phone,
            role: 'Borrower',
          });
        } else {
          // Borrower not in system, add as manual entry option
          potentialRecipients.push({
            userId: null,
            name: project[0].borrowerName || 'Borrower',
            email: project[0].borrowerEmail,
            phone: project[0].borrowerPhone,
            role: 'Borrower (Not Registered)',
          });
        }
      }
      
      res.json({ recipients: potentialRecipients });
    } catch (error: any) {
      console.error('Get potential recipients error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DEAL-BASED DIGEST ENDPOINTS ====================
  // These work with deals (savedQuotes) directly, without requiring a linked project
  
  // Get digest config for a deal
  app.get('/api/admin/deals/:dealId/digest', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      
      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.dealId, dealId));
      
      if (!config[0]) {
        return res.json({ config: null, recipients: [] });
      }
      
      const recipients = await db
        .select()
        .from(loanDigestRecipients)
        .where(eq(loanDigestRecipients.configId, config[0].id));
      
      res.json({ config: config[0], recipients });
    } catch (error: any) {
      console.error('Get deal digest config error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create or update digest config for a deal
  app.post('/api/admin/deals/:dealId/digest', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const { 
        frequency, 
        customDays, 
        timeOfDay, 
        timezone,
        includeDocumentsNeeded,
        includeNotes,
        includeMessages,
        includeGeneralUpdates,
        emailSubject,
        emailBody,
        smsBody,
        isEnabled 
      } = req.body;
      
      // Validate customDays if provided (1-30 range)
      let validatedCustomDays = customDays;
      if (customDays !== undefined && customDays !== null) {
        validatedCustomDays = Math.max(1, Math.min(30, parseInt(customDays) || 2));
      }
      
      // Find the project associated with this deal (required for admin digests page)
      const projectForDeal = await db.select({ id: projects.id })
        .from(projects)
        .where(eq(projects.quoteId, dealId))
        .limit(1);
      const projectId = projectForDeal[0]?.id || null;
      
      // Check if config exists for this deal
      const existing = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.dealId, dealId));
      
      let configId: number;
      
      if (existing[0]) {
        // Update existing - also set projectId if it was missing
        await db
          .update(loanDigestConfigs)
          .set({
            projectId: existing[0].projectId || projectId,
            frequency: frequency || existing[0].frequency,
            customDays: validatedCustomDays !== undefined ? validatedCustomDays : existing[0].customDays,
            timeOfDay: timeOfDay || existing[0].timeOfDay,
            timezone: timezone || existing[0].timezone,
            includeDocumentsNeeded: includeDocumentsNeeded !== undefined ? includeDocumentsNeeded : existing[0].includeDocumentsNeeded,
            includeNotes: includeNotes !== undefined ? includeNotes : existing[0].includeNotes,
            includeMessages: includeMessages !== undefined ? includeMessages : existing[0].includeMessages,
            includeGeneralUpdates: includeGeneralUpdates !== undefined ? includeGeneralUpdates : existing[0].includeGeneralUpdates,
            emailSubject: emailSubject !== undefined ? emailSubject : existing[0].emailSubject,
            emailBody: emailBody !== undefined ? emailBody : existing[0].emailBody,
            smsBody: smsBody !== undefined ? smsBody : existing[0].smsBody,
            isEnabled: isEnabled !== undefined ? isEnabled : existing[0].isEnabled,
            updatedAt: new Date(),
          })
          .where(eq(loanDigestConfigs.id, existing[0].id));
        
        configId = existing[0].id;
      } else {
        // Create new for this deal - include projectId for admin digests
        const result = await db
          .insert(loanDigestConfigs)
          .values({
            dealId,
            projectId,
            frequency: frequency || 'daily',
            customDays: validatedCustomDays,
            timeOfDay: timeOfDay || '09:00',
            timezone: timezone || 'America/New_York',
            includeDocumentsNeeded: includeDocumentsNeeded !== undefined ? includeDocumentsNeeded : true,
            includeNotes: includeNotes !== undefined ? includeNotes : false,
            includeMessages: includeMessages !== undefined ? includeMessages : false,
            includeGeneralUpdates: includeGeneralUpdates !== undefined ? includeGeneralUpdates : true,
            emailSubject: emailSubject || null,
            emailBody: emailBody || null,
            smsBody: smsBody || null,
            isEnabled: isEnabled !== undefined ? isEnabled : true,
            createdBy: req.user?.id,
          })
          .returning({ id: loanDigestConfigs.id });
        
        configId = result[0].id;
      }
      
      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.id, configId));
      
      res.json({ config: config[0] });
    } catch (error: any) {
      console.error('Save deal digest config error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add a recipient to deal digest config
  app.post('/api/admin/deals/:dealId/digest/recipients', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const { userId, recipientName, recipientEmail, recipientPhone, deliveryMethod } = req.body;
      
      // Get config for this deal
      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.dealId, dealId));
      
      if (!config[0]) {
        return res.status(400).json({ error: 'Digest config not found. Create config first.' });
      }
      
      // Validate delivery method vs contact info
      if ((deliveryMethod === 'email' || deliveryMethod === 'both') && !recipientEmail && !userId) {
        return res.status(400).json({ error: 'Email is required for email delivery' });
      }
      if ((deliveryMethod === 'sms' || deliveryMethod === 'both') && !recipientPhone && !userId) {
        return res.status(400).json({ error: 'Phone number is required for SMS delivery' });
      }
      
      const result = await db
        .insert(loanDigestRecipients)
        .values({
          configId: config[0].id,
          userId: userId || null,
          recipientName: recipientName || null,
          recipientEmail: recipientEmail || null,
          recipientPhone: recipientPhone || null,
          deliveryMethod: deliveryMethod || 'email',
          isActive: true,
        })
        .returning();
      
      res.json({ recipient: result[0] });
    } catch (error: any) {
      console.error('Add deal digest recipient error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send a test digest for a deal
  app.post('/api/admin/deals/:dealId/digest/test', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const { recipientId } = req.body;
      
      // Get config for this deal
      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.dealId, dealId));
      
      if (!config[0]) {
        return res.status(400).json({ error: 'Digest config not found' });
      }
      
      const result = await sendTestDigest(config[0].id, recipientId);
      
      if (result.success) {
        res.json({ success: true, message: 'Test digest sent successfully' });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error: any) {
      console.error('Send deal test digest error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get digest history for a deal
  app.get('/api/admin/deals/:dealId/digest/history', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      
      // Get the config first to find the configId
      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.dealId, dealId));
      
      if (!config[0]) {
        return res.json({ history: [] });
      }
      
      const history = await db
        .select()
        .from(digestHistory)
        .where(eq(digestHistory.configId, config[0].id))
        .orderBy(desc(digestHistory.sentAt))
        .limit(50);
      
      res.json({ history });
    } catch (error: any) {
      console.error('Get deal digest history error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get scheduled digest drafts for a deal
  app.get('/api/admin/deals/:dealId/digest/drafts', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.dealId, dealId));

      if (!config[0]) {
        return res.json({ drafts: [] });
      }

      const drafts = await db
        .select()
        .from(scheduledDigestDrafts)
        .where(eq(scheduledDigestDrafts.configId, config[0].id))
        .orderBy(desc(scheduledDigestDrafts.scheduledDate));

      res.json({ drafts });
    } catch (error: any) {
      console.error('Get digest drafts error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update a digest draft (edit content before sending)
  app.put('/api/admin/digest/drafts/:draftId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const draftId = parseInt(req.params.draftId);
      const { emailSubject, emailBody, smsBody } = req.body;

      const [updated] = await db
        .update(scheduledDigestDrafts)
        .set({
          emailSubject,
          emailBody,
          smsBody,
          updatedAt: new Date(),
        })
        .where(eq(scheduledDigestDrafts.id, draftId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      res.json({ draft: updated });
    } catch (error: any) {
      console.error('Update digest draft error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Approve a digest draft
  app.post('/api/admin/digest/drafts/:draftId/approve', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const draftId = parseInt(req.params.draftId);

      const [updated] = await db
        .update(scheduledDigestDrafts)
        .set({
          status: 'approved',
          approvedBy: req.user?.id || null,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scheduledDigestDrafts.id, draftId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      if (updated.projectId) {
        try {
          const existing = await db.select({ id: dealMemoryEntries.id }).from(dealMemoryEntries)
            .where(and(eq(dealMemoryEntries.dealId, updated.projectId), eq(dealMemoryEntries.entryType, 'digest_approved'), sql`metadata->>'draftId' = ${String(updated.id)}`))
            .limit(1);
          if (existing.length === 0) {
            await db.insert(dealMemoryEntries).values({
              dealId: updated.projectId,
              entryType: 'digest_approved',
              title: `Digest approved: ${updated.emailSubject || 'Loan Update'}`,
              description: `Scheduled for ${new Date(updated.scheduledDate).toLocaleDateString()} at ${updated.timeOfDay}`,
              sourceType: 'admin',
              sourceUserId: req.user?.id || null,
              metadata: { draftId: updated.id },
            });
          }
        } catch (e) { console.error('Memory entry error:', e); }
      }

      res.json({ draft: updated });
    } catch (error: any) {
      console.error('Approve digest draft error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Skip a digest draft
  app.post('/api/admin/digest/drafts/:draftId/skip', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const draftId = parseInt(req.params.draftId);

      const [updated] = await db
        .update(scheduledDigestDrafts)
        .set({
          status: 'skipped',
          updatedAt: new Date(),
        })
        .where(eq(scheduledDigestDrafts.id, draftId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      if (updated.projectId) {
        try {
          const existing = await db.select({ id: dealMemoryEntries.id }).from(dealMemoryEntries)
            .where(and(eq(dealMemoryEntries.dealId, updated.projectId), eq(dealMemoryEntries.entryType, 'digest_skipped'), sql`metadata->>'draftId' = ${String(updated.id)}`))
            .limit(1);
          if (existing.length === 0) {
            await db.insert(dealMemoryEntries).values({
              dealId: updated.projectId,
              entryType: 'digest_skipped',
              title: `Digest skipped: ${updated.emailSubject || 'Loan Update'}`,
              description: `Was scheduled for ${new Date(updated.scheduledDate).toLocaleDateString()}`,
              sourceType: 'admin',
              sourceUserId: req.user?.id || null,
              metadata: { draftId: updated.id },
            });
          }
        } catch (e) { console.error('Memory entry error:', e); }
      }

      res.json({ draft: updated });
    } catch (error: any) {
      console.error('Skip digest draft error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create an ad-hoc communication draft for a specific deal on a specific date
  app.post('/api/admin/deals/:dealId/digest/drafts', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const { date, emailSubject, emailBody, smsBody } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: 'Date is required' });
      }

      const config = await db
        .select()
        .from(loanDigestConfigs)
        .where(eq(loanDigestConfigs.dealId, dealId));

      if (!config[0]) {
        return res.status(404).json({ error: 'No communication config found for this deal. Please enable communications first.' });
      }

      const targetDate = new Date(date + 'T12:00:00');
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const existing = await db.select()
        .from(scheduledDigestDrafts)
        .where(and(
          eq(scheduledDigestDrafts.configId, config[0].id),
          gte(scheduledDigestDrafts.scheduledDate, startOfDay),
          lte(scheduledDigestDrafts.scheduledDate, endOfDay),
          sql`${scheduledDigestDrafts.status} NOT IN ('superseded', 'skipped')`
        ))
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({ error: 'A communication already exists for this date. Edit or skip the existing one first.' });
      }

      const recipients = await db.select({
        id: loanDigestRecipients.id,
        recipientName: loanDigestRecipients.recipientName,
        recipientEmail: loanDigestRecipients.recipientEmail,
        recipientPhone: loanDigestRecipients.recipientPhone,
        deliveryMethod: loanDigestRecipients.deliveryMethod,
        userId: loanDigestRecipients.userId,
      })
        .from(loanDigestRecipients)
        .where(and(
          eq(loanDigestRecipients.configId, config[0].id),
          eq(loanDigestRecipients.isActive, true)
        ));

      const [draft] = await db.insert(scheduledDigestDrafts).values({
        configId: config[0].id,
        projectId: config[0].projectId,
        scheduledDate: targetDate,
        timeOfDay: config[0].timeOfDay,
        emailSubject: emailSubject || config[0].emailSubject || 'Loan Update',
        emailBody: emailBody || config[0].emailBody || '',
        smsBody: smsBody || config[0].smsBody || null,
        documentsCount: 0,
        updatesCount: 0,
        recipients: JSON.stringify(recipients),
        status: 'draft',
        source: 'digest',
      }).returning();

      res.json({ draft });
    } catch (error: any) {
      console.error('Create ad-hoc digest draft error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get potential recipients for a deal (borrower and partner)
  app.get('/api/admin/deals/:dealId/potential-recipients', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      
      // Get deal to find associated users
      const deal = await db
        .select()
        .from(savedQuotes)
        .where(eq(savedQuotes.id, dealId));
      
      if (!deal[0]) {
        return res.status(404).json({ error: 'Deal not found' });
      }
      
      const potentialRecipients = [];
      
      // Deal owner (partner/broker)
      if (deal[0].userId) {
        const owner = await db.select().from(users).where(eq(users.id, deal[0].userId));
        if (owner[0]) {
          potentialRecipients.push({
            userId: owner[0].id,
            name: owner[0].fullName || owner[0].email,
            email: owner[0].email,
            phone: owner[0].phone,
            role: 'Partner',
          });
        }
      }
      
      // Look for borrower by email
      if (deal[0].customerEmail) {
        const borrower = await db
          .select()
          .from(users)
          .where(eq(users.email, deal[0].customerEmail));
        
        if (borrower[0]) {
          potentialRecipients.push({
            userId: borrower[0].id,
            name: borrower[0].fullName || borrower[0].email,
            email: borrower[0].email,
            phone: borrower[0].phone,
            role: 'Borrower',
          });
        } else {
          // Borrower not in system, add as manual entry option
          potentialRecipients.push({
            userId: null,
            name: `${deal[0].customerFirstName} ${deal[0].customerLastName}`.trim() || 'Borrower',
            email: deal[0].customerEmail,
            phone: deal[0].customerPhone,
            role: 'Borrower (Not Registered)',
          });
        }
      }
      
      res.json({ recipients: potentialRecipients });
    } catch (error: any) {
      console.error('Get deal potential recipients error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get outstanding documents for a deal (for digest preview)
  app.get('/api/admin/deals/:dealId/outstanding-docs', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      
      // Get documents that are pending or rejected
      const docs = await db
        .select()
        .from(dealDocuments)
        .where(
          and(
            eq(dealDocuments.dealId, dealId),
            inArray(dealDocuments.status, ['pending', 'rejected', 'uploaded'])
          )
        )
        .orderBy(dealDocuments.sortOrder);
      
      res.json({ documents: docs });
    } catch (error: any) {
      console.error('Get deal outstanding docs error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DOCUMENT TEMPLATES API ====================
  
  // Admin guard helper
  const requireAdminRole = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !['admin', 'staff', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  };

  // Get all document templates
  app.get('/api/admin/document-templates', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templates = await db
        .select()
        .from(documentTemplates)
        .orderBy(desc(documentTemplates.createdAt));
      
      res.json({ templates });
    } catch (error: any) {
      console.error('Get document templates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get single document template with fields
  app.get('/api/admin/document-templates/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      
      const template = await db
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.id, templateId))
        .limit(1);
      
      if (template.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      const fields = await db
        .select()
        .from(templateFields)
        .where(eq(templateFields.templateId, templateId))
        .orderBy(templateFields.tabOrder);
      
      res.json({ template: template[0], fields });
    } catch (error: any) {
      console.error('Get document template error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get available field binding keys
  app.get('/api/admin/document-templates/field-bindings', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      res.json({ bindingKeys: fieldBindingKeys });
    } catch (error: any) {
      console.error('Get field bindings error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create document template
  app.post('/api/admin/document-templates', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, pdfUrl, pdfFileName, pageDimensions, pageCount, category, loanType } = req.body;
      
      if (!name || !pdfUrl || !pdfFileName) {
        return res.status(400).json({ error: 'Name, PDF URL, and filename are required' });
      }
      
      const template = await db
        .insert(documentTemplates)
        .values({
          name,
          description,
          pdfUrl,
          pdfFileName,
          pageDimensions: pageDimensions || [],
          pageCount: pageCount || 1,
          category,
          loanType,
          createdBy: req.user!.id,
        })
        .returning();
      
      res.status(201).json({ template: template[0] });
    } catch (error: any) {
      console.error('Create document template error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update document template
  app.patch('/api/admin/document-templates/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const { name, description, category, loanType, isActive, pageDimensions, pageCount } = req.body;
      
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (category !== undefined) updates.category = category;
      if (loanType !== undefined) updates.loanType = loanType;
      if (isActive !== undefined) updates.isActive = isActive;
      if (pageDimensions !== undefined) updates.pageDimensions = pageDimensions;
      if (pageCount !== undefined) updates.pageCount = pageCount;
      
      const template = await db
        .update(documentTemplates)
        .set(updates)
        .where(eq(documentTemplates.id, templateId))
        .returning();
      
      if (template.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      res.json({ template: template[0] });
    } catch (error: any) {
      console.error('Update document template error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete document template
  app.delete('/api/admin/document-templates/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      
      await db
        .delete(documentTemplates)
        .where(eq(documentTemplates.id, templateId));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete document template error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== TEMPLATE FIELDS API ====================

  // Add field to template
  app.post('/api/admin/document-templates/:id/fields', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const { 
        fieldName, fieldKey, fieldType, pageNumber, 
        x, y, width, height, 
        fontSize, fontColor, textAlign, 
        signerRole, isRequired, defaultValue, tabOrder 
      } = req.body;
      
      if (!fieldName || !fieldKey || !fieldType || pageNumber === undefined || 
          x === undefined || y === undefined || width === undefined || height === undefined) {
        return res.status(400).json({ 
          error: 'Field name, key, type, page number, and position (x, y, width, height) are required' 
        });
      }
      
      const field = await db
        .insert(templateFields)
        .values({
          templateId,
          fieldName,
          fieldKey,
          fieldType,
          pageNumber,
          x,
          y,
          width,
          height,
          fontSize: fontSize || 12,
          fontColor: fontColor || '#000000',
          textAlign: textAlign || 'left',
          signerRole,
          isRequired: isRequired || false,
          defaultValue,
          tabOrder: tabOrder || 0,
        })
        .returning();
      
      res.status(201).json({ field: field[0] });
    } catch (error: any) {
      console.error('Add template field error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update field
  app.patch('/api/admin/document-templates/:templateId/fields/:fieldId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const fieldId = parseInt(req.params.fieldId);
      const { 
        fieldName, fieldKey, fieldType, pageNumber, 
        x, y, width, height, 
        fontSize, fontColor, textAlign, 
        signerRole, isRequired, defaultValue, tabOrder 
      } = req.body;
      
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (fieldName !== undefined) updates.fieldName = fieldName;
      if (fieldKey !== undefined) updates.fieldKey = fieldKey;
      if (fieldType !== undefined) updates.fieldType = fieldType;
      if (pageNumber !== undefined) updates.pageNumber = pageNumber;
      if (x !== undefined) updates.x = x;
      if (y !== undefined) updates.y = y;
      if (width !== undefined) updates.width = width;
      if (height !== undefined) updates.height = height;
      if (fontSize !== undefined) updates.fontSize = fontSize;
      if (fontColor !== undefined) updates.fontColor = fontColor;
      if (textAlign !== undefined) updates.textAlign = textAlign;
      if (signerRole !== undefined) updates.signerRole = signerRole;
      if (isRequired !== undefined) updates.isRequired = isRequired;
      if (defaultValue !== undefined) updates.defaultValue = defaultValue;
      if (tabOrder !== undefined) updates.tabOrder = tabOrder;
      
      const field = await db
        .update(templateFields)
        .set(updates)
        .where(eq(templateFields.id, fieldId))
        .returning();
      
      if (field.length === 0) {
        return res.status(404).json({ error: 'Field not found' });
      }
      
      res.json({ field: field[0] });
    } catch (error: any) {
      console.error('Update template field error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete field
  app.delete('/api/admin/document-templates/:templateId/fields/:fieldId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const fieldId = parseInt(req.params.fieldId);
      
      await db
        .delete(templateFields)
        .where(eq(templateFields.id, fieldId));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete template field error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk update fields (for saving all field positions at once)
  app.put('/api/admin/document-templates/:id/fields', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const { fields } = req.body;
      
      if (!Array.isArray(fields)) {
        return res.status(400).json({ error: 'Fields array is required' });
      }
      
      // Delete existing fields
      await db
        .delete(templateFields)
        .where(eq(templateFields.templateId, templateId));
      
      // Insert new fields
      if (fields.length > 0) {
        const fieldsToInsert = fields.map((f: any, index: number) => ({
          templateId,
          fieldName: f.fieldName,
          fieldKey: f.fieldKey,
          fieldType: f.fieldType,
          pageNumber: f.pageNumber,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          fontSize: f.fontSize || 12,
          fontColor: f.fontColor || '#000000',
          textAlign: f.textAlign || 'left',
          signerRole: f.signerRole,
          isRequired: f.isRequired || false,
          defaultValue: f.defaultValue,
          tabOrder: f.tabOrder ?? index,
        }));
        
        await db
          .insert(templateFields)
          .values(fieldsToInsert);
      }
      
      // Fetch and return updated fields
      const updatedFields = await db
        .select()
        .from(templateFields)
        .where(eq(templateFields.templateId, templateId))
        .orderBy(templateFields.tabOrder);
      
      res.json({ fields: updatedFields });
    } catch (error: any) {
      console.error('Bulk update template fields error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== PDF GENERATION ====================

  // Generate PDF with prefilled fields
  app.post('/api/admin/document-templates/:id/generate', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const { data, quoteId } = req.body; // data is a key-value map for field binding
      
      // Get template
      const template = await db
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.id, templateId))
        .limit(1);
      
      if (template.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      // Get fields
      const fields = await db
        .select()
        .from(templateFields)
        .where(eq(templateFields.templateId, templateId));
      
      // Download the PDF from object storage
      const pdfUrl = template[0].pdfUrl;
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error('Failed to fetch template PDF');
      }
      const pdfBytes = await pdfResponse.arrayBuffer();
      
      // Load the PDF
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      // Helper to get nested value from data object
      const getValue = (key: string, data: Record<string, any>): string => {
        const parts = key.split('.');
        let value: any = data;
        for (const part of parts) {
          if (value && typeof value === 'object' && part in value) {
            value = value[part];
          } else {
            return '';
          }
        }
        return value?.toString() || '';
      };
      
      // Fill in fields
      for (const field of fields) {
        // Skip signature fields - those are handled separately
        if (field.fieldType === 'signature') continue;
        
        const page = pages[field.pageNumber - 1];
        if (!page) continue;
        
        const value = getValue(field.fieldKey, data || {}) || field.defaultValue || '';
        
        if (field.fieldType === 'checkbox') {
          // Draw a checkbox
          if (value === 'true' || value === '1' || value === 'yes') {
            page.drawText('✓', {
              x: field.x,
              y: field.y,
              size: field.fontSize || 12,
              font,
              color: rgb(0, 0, 0),
            });
          }
        } else if (field.fieldType === 'date') {
          // Format date if it's a valid date string
          let displayValue = value;
          try {
            if (value) {
              const date = new Date(value);
              displayValue = format(date, 'MM/dd/yyyy');
            }
          } catch (e) {
            displayValue = value;
          }
          page.drawText(displayValue, {
            x: field.x,
            y: field.y,
            size: field.fontSize || 12,
            font,
            color: rgb(0, 0, 0),
          });
        } else {
          // Text or number field
          page.drawText(value, {
            x: field.x,
            y: field.y,
            size: field.fontSize || 12,
            font,
            color: rgb(0, 0, 0),
          });
        }
      }
      
      // Save the modified PDF
      const modifiedPdfBytes = await pdfDoc.save();
      
      // Upload to object storage
      const fileName = `generated_${template[0].pdfFileName.replace('.pdf', '')}_${Date.now()}.pdf`;
      const uploadResult = await objectStorageService.uploadFile(
        Buffer.from(modifiedPdfBytes),
        fileName,
        'application/pdf',
        false // private
      );
      
      res.json({ 
        success: true, 
        pdfUrl: uploadResult.url,
        fileName 
      });
    } catch (error: any) {
      console.error('Generate PDF error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get active templates for users (non-admin route)
  app.get('/api/document-templates', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { loanType, category } = req.query;
      
      let query = db
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.isActive, true));
      
      const templates = await query.orderBy(documentTemplates.name);
      
      // Filter in memory if needed
      let filtered = templates;
      if (loanType) {
        filtered = filtered.filter(t => !t.loanType || t.loanType === loanType);
      }
      if (category) {
        filtered = filtered.filter(t => !t.category || t.category === category);
      }
      
      res.json({ templates: filtered });
    } catch (error: any) {
      console.error('Get templates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get template with fields for document generation
  app.get('/api/document-templates/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      
      const template = await db
        .select()
        .from(documentTemplates)
        .where(and(
          eq(documentTemplates.id, templateId),
          eq(documentTemplates.isActive, true)
        ))
        .limit(1);
      
      if (template.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      const fields = await db
        .select()
        .from(templateFields)
        .where(eq(templateFields.templateId, templateId))
        .orderBy(templateFields.tabOrder);
      
      res.json({ template: template[0], fields });
    } catch (error: any) {
      console.error('Get template error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PandaDoc E-Sign Integration Routes
  // ============================================

  app.post('/api/esign/pandadoc/documents/create', authenticateUser, requireAdmin, async (_req: AuthRequest, res: Response) => {
    res.status(410).json({ 
      error: 'Deprecated: must send via PandaDoc. Use POST /api/documents/:id/pandadoc/send' 
    });
  });

  app.post('/api/esign/pandadoc/documents/create-from-pdf', authenticateUser, requireAdmin, async (_req: AuthRequest, res: Response) => {
    res.status(410).json({ 
      error: 'Deprecated: must send via PandaDoc. Use POST /api/documents/:id/pandadoc/send' 
    });
  });

  app.post('/api/esign/pandadoc/documents/:envelopeId/send', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const envelopeId = parseInt(req.params.envelopeId);
      const envelope = await db.select().from(esignEnvelopes).where(eq(esignEnvelopes.id, envelopeId)).limit(1);
      if (!envelope.length) {
        return res.status(404).json({ error: 'Envelope not found' });
      }
      const env = envelope[0];
      if (!env.externalDocumentId) {
        return res.status(400).json({ error: 'Envelope has no PandaDoc document ID' });
      }

      await pandadoc.waitForDocumentReady(env.externalDocumentId);
      const sendResult = await pandadoc.sendDocument(env.externalDocumentId, {
        subject: `Please sign: ${env.documentName}`,
        message: 'Please review and sign the attached document.',
        silent: false,
      });

      await db.update(esignEnvelopes)
        .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
        .where(eq(esignEnvelopes.id, envelopeId));

      res.json({ success: true, status: 'sent' });
    } catch (error) {
      console.error('Error sending PandaDoc envelope:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post('/api/esign/pandadoc/documents/:documentId/editing-session', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { documentId } = req.params;
      const userEmail = req.user!.email;
      
      const pandadoc = await import('./esign/pandadoc');
      const session = await pandadoc.createEditingSession(documentId, userEmail, { lifetime: 3600 });
      
      res.json({
        success: true,
        token: session.token,
        sessionId: session.id,
        expiresAt: session.expires_at,
      });
    } catch (error: any) {
      console.error('PandaDoc create editing session error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get envelopes for a quote (signing status tracking)
  app.get('/api/esign/pandadoc/quote/:quoteId/envelopes', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      if (isNaN(quoteId)) {
        return res.status(400).json({ error: 'Invalid quoteId' });
      }
      
      const envelopes = await db.select().from(esignEnvelopes)
        .where(eq(esignEnvelopes.quoteId, quoteId))
        .orderBy(esignEnvelopes.createdAt);
      
      const envelopesWithEvents = await Promise.all(
        envelopes.map(async (env) => {
          const events = await db.select().from(esignEvents)
            .where(eq(esignEvents.envelopeId, env.id))
            .orderBy(esignEvents.createdAt);
          let hasProject = false;
          if (env.quoteId) {
            const existingProjects = await db.select({ id: projects.id }).from(projects)
              .where(eq(projects.quoteId, env.quoteId));
            hasProject = existingProjects.length > 0;
          }
          return { ...env, events, hasProject };
        })
      );
      
      res.json({ envelopes: envelopesWithEvents });
    } catch (error: any) {
      console.error('Error fetching envelopes for quote:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Preview tokens that will be populated for a quote
  app.get('/api/esign/pandadoc/quote/:quoteId/tokens', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      if (isNaN(quoteId)) {
        return res.status(400).json({ error: 'Invalid quoteId' });
      }
      
      const [quote] = await db.select().from(savedQuotes).where(eq(savedQuotes.id, quoteId));
      if (!quote) {
        return res.status(404).json({ error: 'Quote not found' });
      }
      
      const { mapQuoteToPandaTokens, getAllAvailableTokenNames } = await import('./esign/field-mapping');
      const tokens = mapQuoteToPandaTokens(quote);
      const availableTokenNames = getAllAvailableTokenNames();
      
      res.json({ tokens, availableTokenNames });
    } catch (error: any) {
      console.error('Error generating token preview:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Save PandaDoc document as template
  app.post('/api/esign/pandadoc/documents/:documentId/save-as-template', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { documentId } = req.params;
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Template name is required' });
      }
      
      console.log(`[PandaDoc] Downloading document ${documentId} to save as template...`);
      const pdfBuffer = await pandadoc.downloadDocument(documentId);
      
      console.log(`[PandaDoc] Creating template "${name}" from document...`);
      const template = await pandadoc.createTemplateFromFile(name, pdfBuffer, {
        roles: [{ name: 'Client' }],
        tags: ['auto-created'],
      });
      
      console.log(`[PandaDoc] Template created: ${template.id}`);
      res.json({ success: true, template });
    } catch (error: any) {
      console.error('Error saving document as template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get PandaDoc document status
  app.get('/api/esign/pandadoc/documents/:documentId/status', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { documentId } = req.params;
      
      // First check our database
      const [envelope] = await db.select().from(esignEnvelopes)
        .where(eq(esignEnvelopes.externalDocumentId, documentId));
      
      if (!envelope) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Fetch latest status from PandaDoc
      const pandadoc = await import('./esign/pandadoc');
      const pandaStatus = await pandadoc.getDocumentStatus(documentId);
      
      // Update our database with new status
      const newStatus = pandadoc.mapStatusToPandaDoc(pandaStatus.status);
      
      const updates: any = { status: newStatus, updatedAt: new Date() };
      if (newStatus === 'completed' && !envelope.completedAt) {
        updates.completedAt = new Date();
      }
      if (newStatus === 'viewed' && !envelope.viewedAt) {
        updates.viewedAt = new Date();
      }
      
      await db.update(esignEnvelopes)
        .set(updates)
        .where(eq(esignEnvelopes.id, envelope.id));
      
      res.json({
        id: envelope.id,
        externalDocumentId: documentId,
        status: newStatus,
        viewedAt: envelope.viewedAt,
        completedAt: envelope.completedAt,
        signedPdfUrl: envelope.signedPdfUrl,
        recipients: envelope.recipients,
      });
    } catch (error: any) {
      console.error('PandaDoc get status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Download signed PDF
  app.get('/api/esign/pandadoc/documents/:documentId/download', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { documentId } = req.params;
      
      // Verify document exists in our system
      const [envelope] = await db.select().from(esignEnvelopes)
        .where(eq(esignEnvelopes.externalDocumentId, documentId));
      
      if (!envelope) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      // Download from PandaDoc
      const pandadoc = await import('./esign/pandadoc');
      const pdfBuffer = await pandadoc.downloadSignedPdf(documentId);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${envelope.documentName}.pdf"`);
      res.send(Buffer.from(pdfBuffer));
    } catch (error: any) {
      console.error('PandaDoc download error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List PandaDoc templates
  app.get('/api/esign/pandadoc/templates', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const pandadoc = await import('./esign/pandadoc');
      const templates = await pandadoc.listTemplates();
      res.json({ templates });
    } catch (error: any) {
      console.error('PandaDoc list templates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get PandaDoc template details (including roles)
  app.get('/api/esign/pandadoc/templates/:templateId/details', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const { templateId } = req.params;
      const pandadoc = await import('./esign/pandadoc');
      const details = await pandadoc.getTemplateDetails(templateId);
      
      // Extract roles from template details
      const roles = details.roles?.map((r: any) => ({
        name: r.name,
        preassigned_person: r.preassigned_person,
      })) || [];
      
      res.json({ 
        id: details.id,
        name: details.name,
        roles,
        tokens: details.tokens || [],
        fields: details.fields || [],
      });
    } catch (error: any) {
      console.error('PandaDoc get template details error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PandaDoc API key status - check if configured (super admin sees full details, regular admin sees connected/not)
  app.get('/api/admin/pandadoc/status', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      // Check env var first, then system setting
      let apiKey = process.env.PANDADOC_API_KEY;
      if (!apiKey) {
        const setting = await storage.getSettingByKey('pandadoc_api_key');
        apiKey = setting?.settingValue || '';
      }
      const isSuperAdmin = req.user?.role === 'super_admin';
      if (apiKey) {
        const result: any = { connected: true };
        if (isSuperAdmin) {
          result.maskedKey = apiKey.length > 8
            ? apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4)
            : '****';
        }
        res.json(result);
      } else {
        res.json({ connected: false });
      }
    } catch (error: any) {
      res.status(500).json({ connected: false, error: error.message });
    }
  });

  // PandaDoc API key test - verify the key works (super admin only)
  app.get('/api/admin/pandadoc/test', authenticateUser, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      let apiKey = process.env.PANDADOC_API_KEY;
      if (!apiKey) {
        const setting = await storage.getSettingByKey('pandadoc_api_key');
        apiKey = setting?.settingValue || '';
      }
      if (!apiKey) {
        return res.json({ connected: false, error: 'No API key configured' });
      }
      // Test the key by fetching current member info
      const response = await fetch('https://api.pandadoc.com/public/v1/members/current/', {
        headers: { 'Authorization': `API-Key ${apiKey}` },
      });
      if (response.ok) {
        const data = await response.json();
        res.json({
          connected: true,
          workspace: data.workspace_name || data.company_name || 'PandaDoc',
          email: data.email,
        });
      } else {
        res.json({ connected: false, error: `API returned ${response.status}: ${response.statusText}` });
      }
    } catch (error: any) {
      res.json({ connected: false, error: error.message });
    }
  });

  // OpenAI API key status
  app.get('/api/admin/openai/status', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      let apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      if (!apiKey) {
        const setting = await storage.getSettingByKey('openai_api_key');
        apiKey = setting?.settingValue || '';
      }
      const isSuperAdmin = req.user?.role === 'super_admin';
      if (apiKey) {
        const result: any = { connected: true };
        if (isSuperAdmin) {
          result.maskedKey = apiKey.substring(0, 7) + '...' + apiKey.substring(apiKey.length - 4);
          result.source = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ? 'integration' : 'manual';
        }
        return res.json(result);
      }
      res.json({ connected: false });
    } catch (error) {
      console.error('OpenAI status check error:', error);
      res.json({ connected: false });
    }
  });

  // OpenAI API key test
  app.get('/api/admin/openai/test', authenticateUser, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      let apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      if (!apiKey) {
        const setting = await storage.getSettingByKey('openai_api_key');
        apiKey = setting?.settingValue || '';
      }
      if (!apiKey) {
        return res.json({ connected: false, error: 'No API key configured' });
      }
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });
      const models = await openai.models.list();
      const modelCount = models.data?.length || 0;
      res.json({
        connected: true,
        message: `Connected successfully. ${modelCount} models available.`,
      });
    } catch (error: any) {
      res.json({ connected: false, error: error.message || 'Connection failed' });
    }
  });

  // Debug endpoint to test PandaDoc connection and list all templates
  app.get('/api/pandadoc/debug', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const pandadoc = await import('./esign/pandadoc');
      const debugInfo = await pandadoc.getDebugInfo();
      
      const runTest = req.query.test === 'true';
      let capabilityTest = null;
      
      if (runTest) {
        const testEmail = process.env.TEST_EXTERNAL_EMAIL || 'test-external@example.com';
        capabilityTest = await pandadoc.runCapabilityTest(testEmail);
        capabilityTest = { ...capabilityTest, testEmail };
      }
      
      res.json({
        success: true,
        debug: {
          apiBase: debugInfo.apiBase,
          authType: debugInfo.authType,
          apiKeyPrefix: debugInfo.apiKeyPrefix,
          isSandbox: debugInfo.isSandbox,
          currentMember: debugInfo.currentMember,
          workspaceId: debugInfo.workspaceId,
          connectedAccount: debugInfo.currentMember?.email || null,
          connectedName: debugInfo.currentMember?.first_name 
            ? `${debugInfo.currentMember.first_name} ${debugInfo.currentMember.last_name || ''}`.trim()
            : null,
          workspaceName: debugInfo.currentMember?.workspace_name || null,
          memberRole: debugInfo.currentMember?.role || null,
          userLicense: debugInfo.currentMember?.user_license || null,
        },
        capabilityTest,
        diagnosis: debugInfo.isSandbox
          ? "SANDBOX KEY DETECTED: Sandbox API keys cannot send documents to external recipients. You need a production API key from a paid PandaDoc plan."
          : debugInfo.currentMember?.error
            ? "AUTHENTICATION ERROR: Could not verify the connected PandaDoc account. Check your API key."
            : "API key is production and connected to the correct workspace. If sending to external recipients fails, your PandaDoc plan may not include API-level external sending. Documents will be created in PandaDoc and you can send them from the PandaDoc editor.",
      });
    } catch (error: any) {
      console.error('PandaDoc debug error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/esign/pandadoc/debug/templates', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const pandadoc = await import('./esign/pandadoc');
      const result = await pandadoc.listAllTemplates();
      
      res.json({
        success: !result.error,
        apiBase: result.apiBase,
        templateCount: result.results.length,
        templates: result.results.map((t: any) => ({
          id: t.id,
          name: t.name,
          date_created: t.date_created,
          date_modified: t.date_modified,
        })),
        error: result.error || null,
        help: result.error ? {
          message: "If you see a 403 error, try these fixes:",
          suggestions: [
            "1. Verify your API key was created in the same PandaDoc account that owns the templates",
            "2. Try setting PANDADOC_API_BASE_URL to 'https://api-eu.pandadoc.com/public/v1' if using EU region",
            "3. Check if your API key has 'Templates' permission in PandaDoc settings",
            "4. Regenerate your API key if it was recently created (sometimes takes a few minutes to activate)"
          ]
        } : null,
      });
    } catch (error: any) {
      console.error('PandaDoc debug templates error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message,
        help: {
          message: "Connection to PandaDoc failed",
          suggestions: [
            "Check if PANDADOC_API_KEY is set correctly",
            "Verify the API key format (should be raw key, not 'API-Key xxx')",
          ]
        }
      });
    }
  });

  // Debug endpoint to get full document details from PandaDoc
  app.get('/api/esign/pandadoc/debug/document/:documentId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { documentId } = req.params;
      const pandadoc = await import('./esign/pandadoc');
      
      console.log(`[PandaDoc Debug] Fetching document details for: ${documentId}`);
      
      const docStatus = await pandadoc.getDocumentStatus(documentId);
      
      res.json({
        success: true,
        document: docStatus,
      });
    } catch (error: any) {
      console.error('PandaDoc debug document error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message,
        help: {
          message: "Failed to fetch document details",
          suggestions: [
            "Verify the document ID is correct",
            "Check if the document was created with your API key",
            "Documents from a different PandaDoc account won't be accessible"
          ]
        }
      });
    }
  });

  // ===================== PandaDoc Status Sync =====================

  app.post('/api/admin/pandadoc/sync/:envelopeId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const envelopeId = parseInt(req.params.envelopeId);
      const { syncEnvelopeStatus } = await import('./services/pandadocSync');
      const result = await syncEnvelopeStatus(envelopeId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/admin/pandadoc/sync-all', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { pollPendingEnvelopes } = await import('./services/pandadocSync');
      const result = await pollPendingEnvelopes();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/admin/pandadoc/events/:envelopeId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const envelopeId = parseInt(req.params.envelopeId);
      const events = await db.select().from(esignEvents)
        .where(eq(esignEvents.envelopeId, envelopeId))
        .orderBy(esignEvents.createdAt);
      res.json({ events });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/esign/envelopes/:id/sync', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const envelopeId = parseInt(req.params.id);
      const [envelope] = await db.select().from(esignEnvelopes)
        .where(eq(esignEnvelopes.id, envelopeId));
      
      if (!envelope) {
        return res.status(404).json({ error: 'Envelope not found' });
      }
      
      const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');
      if (!isAdmin && envelope.createdBy !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      const { syncEnvelopeStatus } = await import('./services/pandadocSync');
      const result = await syncEnvelopeStatus(envelopeId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get envelopes for a quote
  app.get('/api/esign/envelopes/quote/:quoteId', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      
      const envelopes = await db.select().from(esignEnvelopes)
        .where(eq(esignEnvelopes.quoteId, quoteId))
        .orderBy(esignEnvelopes.createdAt);
      
      res.json({ envelopes });
    } catch (error: any) {
      console.error('Get envelopes error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get envelope by ID
  app.get('/api/esign/envelopes/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const envelopeId = parseInt(req.params.id);
      
      const [envelope] = await db.select().from(esignEnvelopes)
        .where(eq(esignEnvelopes.id, envelopeId));
      
      if (!envelope) {
        return res.status(404).json({ error: 'Envelope not found' });
      }
      
      const events = await db.select().from(esignEvents)
        .where(eq(esignEvents.envelopeId, envelopeId))
        .orderBy(esignEvents.createdAt);
      
      res.json({ envelope, events });
    } catch (error: any) {
      console.error('Get envelope error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create project from a signed envelope (available to quote owner or admin)
  app.post('/api/envelopes/:envelopeId/create-project', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const envelopeId = parseInt(req.params.envelopeId);
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const [envelope] = await db.select().from(esignEnvelopes).where(eq(esignEnvelopes.id, envelopeId));
      if (!envelope) {
        res.status(404).json({ error: 'Envelope not found' });
        return;
      }
      if (envelope.status !== 'completed') {
        res.status(400).json({ error: 'Document must be fully signed (completed) before creating a deal' });
        return;
      }
      if (!envelope.quoteId) {
        res.status(400).json({ error: 'This envelope is not linked to a quote' });
        return;
      }
      const [quote] = await db.select().from(savedQuotes).where(eq(savedQuotes.id, envelope.quoteId));
      if (!quote) {
        res.status(404).json({ error: 'Linked quote not found' });
        return;
      }
      const isAdmin = userRole === 'admin' || userRole === 'super_admin';
      if (!isAdmin && quote.userId !== userId) {
        res.status(403).json({ error: 'You do not have permission to create a deal from this quote' });
        return;
      }
      const existingProjects = await db.select().from(projects).where(eq(projects.quoteId, quote.id));
      if (existingProjects.length > 0) {
        res.status(409).json({ error: 'A deal already exists for this quote', projectId: existingProjects[0].id });
        return;
      }

      const projectNumber = await storage.generateProjectNumber();
      const borrowerToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
      const loanData = (quote.loanData || {}) as Record<string, any>;
      const isRTLQuote = loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined;
      const loanAmount = loanData?.loanAmount
        ? Number(loanData.loanAmount)
        : isRTLQuote
          ? (Number(loanData?.asIsValue) || 0) + (Number(loanData?.rehabBudget) || 0)
          : 0;
      const rateStr = quote.interestRate || '';
      const rateNum = parseFloat(rateStr.replace('%', ''));
      const borrowerName = `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim();
      const borrowerEmail = quote.customerEmail || null;

      let borrowerPhone: string | null = null;
      if (quote.customerPhone) {
        borrowerPhone = quote.customerPhone;
      } else if (quote.userId) {
        const quoteUser = await storage.getUserById(quote.userId);
        if (quoteUser?.phone) borrowerPhone = quoteUser.phone;
      }

      const project = await storage.createProject({
        userId: quote.userId || envelope.createdBy!,
        projectName: `${borrowerName} — ${quote.propertyAddress || envelope.documentName || 'New Loan'}`,
        projectNumber,
        loanAmount: loanAmount || null,
        interestRate: !isNaN(rateNum) ? rateNum : null,
        loanTermMonths: loanData?.loanTermMonths ? parseInt(loanData.loanTermMonths) : (loanData?.loanTerm ? parseInt(String(loanData.loanTerm)) : null),
        loanType: loanData?.loanType || loanData?.selectedLoanType || (isRTLQuote ? 'fix_and_flip' : 'dscr'),
        programId: quote.programId || null,
        propertyAddress: quote.propertyAddress || null,
        propertyType: loanData?.propertyType || null,
        borrowerName,
        borrowerEmail,
        borrowerPhone,
        status: 'active',
        currentStage: 'documentation',
        progressPercentage: 0,
        applicationDate: new Date(),
        targetCloseDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        borrowerPortalToken: borrowerToken,
        borrowerPortalEnabled: true,
        quoteId: quote.id,
        notes: `Manually created from signed envelope #${envelope.id} (Quote #${quote.id})`,
        metadata: {
          pandadocEnvelopeId: envelope.id,
          pandadocDocumentId: envelope.externalDocumentId,
          manuallyCreatedBy: req.user!.id,
          quoteData: {
            interestRate: quote.interestRate,
            pointsCharged: quote.pointsCharged,
            pointsAmount: quote.pointsAmount,
            tpoPremiumAmount: quote.tpoPremiumAmount,
            totalRevenue: quote.totalRevenue,
            commission: quote.commission,
            partnerId: quote.partnerId,
            partnerName: quote.partnerName,
            customerFirstName: quote.customerFirstName,
            customerLastName: quote.customerLastName,
            customerCompanyName: quote.customerCompanyName,
            customerEmail: quote.customerEmail,
            customerPhone: quote.customerPhone,
            loanData,
          },
        },
      } as any);

      if (quote.propertyAddress) {
        await db.insert(dealProperties).values({
          dealId: project.id,
          address: quote.propertyAddress,
          propertyType: loanData?.propertyType || null,
          estimatedValue: loanData?.propertyValue || loanData?.asIsValue || null,
          isPrimary: true,
          sortOrder: 0,
        });
        const additionalProps = (loanData?.additionalProperties || []) as Array<Record<string, any>>;
        for (let i = 0; i < additionalProps.length; i++) {
          const ap = additionalProps[i];
          if (ap.address) {
            await db.insert(dealProperties).values({
              dealId: project.id,
              address: ap.address,
              propertyType: ap.propertyType || null,
              estimatedValue: ap.estimatedValue || null,
              isPrimary: false,
              sortOrder: i + 1,
            });
          }
        }
      }

      const { buildProjectPipelineFromProgram } = await import('./services/projectPipeline');
      const pipelineResult = await buildProjectPipelineFromProgram(project.id, quote.programId || null, quote.id);

      await db.update(savedQuotes)
        .set({ stage: 'term-sheet-signed' })
        .where(eq(savedQuotes.id, quote.id));

      await storage.createProjectActivity({
        projectId: project.id,
        userId: req.user!.id,
        activityType: 'project_created',
        activityDescription: `Loan deal ${projectNumber} created from signed term sheet "${envelope.documentName}"`,
        visibleToBorrower: true,
      });

      const { triggerWebhook } = await import('./utils/webhooks');
      await triggerWebhook(project.id, 'project_created', {
        project_number: projectNumber,
        source: 'admin_manual_from_envelope',
        envelope_id: envelope.id,
        quote_id: quote.id,
      });

      try {
        const { isDriveIntegrationEnabled, ensureProjectFolder } = await import('./services/googleDrive');
        const driveEnabled = await isDriveIntegrationEnabled();
        if (driveEnabled) {
          ensureProjectFolder(project.id).catch((err: any) => {
            console.error(`Drive folder creation failed for deal ${project.id}:`, err.message);
          });
        }
      } catch (_e) {}

      res.json({
        success: true,
        project: { id: project.id, projectNumber, projectName: project.projectName },
        pipeline: pipelineResult,
      });
    } catch (error: any) {
      console.error('Error manually creating project from envelope:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PandaDoc webhook endpoint
  app.post('/api/webhooks/pandadoc', async (req: Request, res: Response) => {
    try {
      const payload = JSON.stringify(req.body);
      const signature = req.headers['x-pandadoc-signature'] as string;
      
      // Verify webhook signature if secret is configured
      const pandadoc = await import('./esign/pandadoc');
      const isValid = await pandadoc.verifyWebhookSignature(payload, signature || '');
      
      if (!isValid) {
        console.warn('Invalid PandaDoc webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      const { event, data } = req.body;
      const documentId = data?.id;
      
      if (!documentId) {
        return res.status(400).json({ error: 'Missing document ID' });
      }
      
      // Find envelope
      const [envelope] = await db.select().from(esignEnvelopes)
        .where(eq(esignEnvelopes.externalDocumentId, documentId));
      
      if (envelope) {
        const [eventRecord] = await db.insert(esignEvents).values({
          vendor: 'pandadoc',
          envelopeId: envelope.id,
          externalDocumentId: documentId,
          eventType: event,
          eventData: JSON.stringify(req.body),
          processed: false,
        }).returning();
        
        let processingError: string | null = null;
        
        try {
          const newStatus = pandadoc.mapStatusToPandaDoc(event);
          const updates: any = { status: newStatus, updatedAt: new Date() };
          
          if (event === 'document.completed') {
            updates.completedAt = new Date();

            // Download and persist signed PDF
            let signedPdfPath: string | null = null;
            let signedPdfSize: number = 0;
            try {
              const pdfBuffer = await pandadoc.downloadSignedPdf(documentId);
              signedPdfSize = pdfBuffer.byteLength;
              console.log(`Downloaded signed PDF for document ${documentId}, size: ${signedPdfSize} bytes`);

              // Save to filesystem
              const fs = await import('fs');
              const path = await import('path');
              const uploadsDir = path.join(process.cwd(), 'uploads', 'signed', String(envelope.id));
              await fs.promises.mkdir(uploadsDir, { recursive: true });
              const safeName = (envelope.documentName || 'signed-document').replace(/[^a-zA-Z0-9._-]/g, '_');
              signedPdfPath = path.join(uploadsDir, `${safeName}.pdf`);
              await fs.promises.writeFile(signedPdfPath, Buffer.from(pdfBuffer));
              console.log(`Saved signed PDF to ${signedPdfPath}`);

              // Update envelope with signed PDF path
              await db.update(esignEnvelopes)
                .set({ signedPdfUrl: signedPdfPath })
                .where(eq(esignEnvelopes.id, envelope.id));
            } catch (downloadError) {
              console.error('Failed to download/save signed PDF:', downloadError);
            }

          // Auto-create project/deal from signed term sheet
          if (envelope.quoteId) {
            try {
              const [quote] = await db.select().from(savedQuotes).where(eq(savedQuotes.id, envelope.quoteId));
              if (quote) {
                const existingProjects = await db.select().from(projects)
                  .where(eq(projects.quoteId, quote.id));
                
                if (existingProjects.length === 0) {
                  const projectNumber = await storage.generateProjectNumber();
                  const borrowerToken = (await import('uuid')).v4().replace(/-/g, '') + (await import('uuid')).v4().replace(/-/g, '');
                  const loanData = (quote.loanData || {}) as Record<string, any>;
                  const recipientsData = typeof envelope.recipients === 'string' 
                    ? JSON.parse(envelope.recipients) 
                    : (envelope.recipients || []);
                  const firstRecipient = Array.isArray(recipientsData) ? recipientsData[0] : null;

                  const isRTLQuote = loanData?.asIsValue || loanData?.arv || loanData?.rehabBudget !== undefined;
                  const loanAmount = loanData?.loanAmount
                    ? Number(loanData.loanAmount)
                    : isRTLQuote
                      ? (Number(loanData?.asIsValue) || 0) + (Number(loanData?.rehabBudget) || 0)
                      : 0;
                  const rateStr = quote.interestRate || '';
                  const rateNum = parseFloat(rateStr.replace('%', ''));
                  const borrowerName = `${quote.customerFirstName || ''} ${quote.customerLastName || ''}`.trim();
                  const borrowerEmail = quote.customerEmail || firstRecipient?.email || null;

                  let borrowerPhone: string | null = null;
                  if (quote.customerPhone) {
                    borrowerPhone = quote.customerPhone;
                  } else if (quote.userId) {
                    const quoteUser = await storage.getUserById(quote.userId);
                    if (quoteUser?.phone) borrowerPhone = quoteUser.phone;
                  }
                  
                  const project = await storage.createProject({
                    userId: quote.userId || envelope.createdBy!,
                    projectName: `${borrowerName} — ${quote.propertyAddress || envelope.documentName || 'New Loan'}`,
                    projectNumber,
                    loanAmount: loanAmount || null,
                    interestRate: !isNaN(rateNum) ? rateNum : null,
                    loanTermMonths: loanData?.loanTermMonths ? parseInt(loanData.loanTermMonths) : (loanData?.loanTerm ? parseInt(String(loanData.loanTerm)) : null),
                    loanType: loanData?.loanType || loanData?.selectedLoanType || (isRTLQuote ? 'fix_and_flip' : 'dscr'),
                    programId: quote.programId || null,
                    propertyAddress: quote.propertyAddress || null,
                    propertyType: loanData?.propertyType || null,
                    borrowerName,
                    borrowerEmail,
                    borrowerPhone,
                    status: 'active',
                    currentStage: 'documentation',
                    progressPercentage: 0,
                    applicationDate: new Date(),
                    targetCloseDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
                    borrowerPortalToken: borrowerToken,
                    borrowerPortalEnabled: true,
                    quoteId: quote.id,
                    notes: `Auto-created from signed PandaDoc term sheet (Quote #${quote.id})`,
                    metadata: {
                      pandadocEnvelopeId: envelope.id,
                      pandadocDocumentId: documentId,
                      quoteData: {
                        interestRate: quote.interestRate,
                        pointsCharged: quote.pointsCharged,
                        pointsAmount: quote.pointsAmount,
                        tpoPremiumAmount: quote.tpoPremiumAmount,
                        totalRevenue: quote.totalRevenue,
                        commission: quote.commission,
                        partnerId: quote.partnerId,
                        partnerName: quote.partnerName,
                        customerFirstName: quote.customerFirstName,
                        customerLastName: quote.customerLastName,
                        customerCompanyName: quote.customerCompanyName,
                        customerEmail: quote.customerEmail,
                        customerPhone: quote.customerPhone,
                        loanData,
                      },
                    },
                  } as any);
                  
                  if (quote.propertyAddress) {
                    await db.insert(dealProperties).values({
                      dealId: project.id,
                      address: quote.propertyAddress,
                      propertyType: loanData?.propertyType || null,
                      estimatedValue: loanData?.propertyValue || loanData?.asIsValue || null,
                      isPrimary: true,
                      sortOrder: 0,
                    });
                    const additionalProps = (loanData?.additionalProperties || []) as Array<Record<string, any>>;
                    for (let i = 0; i < additionalProps.length; i++) {
                      const ap = additionalProps[i];
                      if (ap.address) {
                        await db.insert(dealProperties).values({
                          dealId: project.id,
                          address: ap.address,
                          propertyType: ap.propertyType || null,
                          estimatedValue: ap.estimatedValue || null,
                          isPrimary: false,
                          sortOrder: i + 1,
                        });
                      }
                    }
                  }

                  const { buildProjectPipelineFromProgram } = await import('./services/projectPipeline');
                  const pipelineResult = await buildProjectPipelineFromProgram(project.id, quote.programId || null, quote.id);
                  console.log(`[PandaDoc Webhook] Pipeline created: ${pipelineResult.stagesCreated} stages, ${pipelineResult.tasksCreated} tasks, ${pipelineResult.documentsCreated} documents`);
                  
                  await db.update(savedQuotes)
                    .set({ stage: 'term-sheet-signed' })
                    .where(eq(savedQuotes.id, quote.id));
                  
                  await storage.createProjectActivity({
                    projectId: project.id,
                    userId: quote.userId || envelope.createdBy!,
                    activityType: 'project_created',
                    activityDescription: `Loan project ${projectNumber} auto-created from signed term sheet "${envelope.documentName}"`,
                    visibleToBorrower: true,
                  });
                  
                  const { triggerWebhook } = await import('./utils/webhooks');
                  await triggerWebhook(project.id, 'project_created', {
                    project_number: projectNumber,
                    source: 'pandadoc_signed',
                    created_from_pandadoc: true,
                    pandadoc_document_id: documentId,
                    envelope_id: envelope.id,
                    quote_id: quote.id,
                  });
                  
                  console.log(`[PandaDoc Webhook] Project ${projectNumber} auto-created from signed term sheet (envelope ${envelope.id}, quote ${quote.id})`);
                  
                  // Store signed PDF as deal document (Stage 1 "Signed Agreement") and sync to cloud
                  if (signedPdfPath && signedPdfSize > 0) {
                    try {
                      const { syncSignedDocumentToDeal } = await import('./services/signedDocumentSync');
                      const syncResult = await syncSignedDocumentToDeal({
                        projectId: project.id,
                        envelopeId: envelope.id,
                        externalDocumentId: documentId,
                        documentName: envelope.documentName || 'Signed Term Sheet',
                        signedPdfPath,
                        fileSize: signedPdfSize,
                        createdBy: envelope.createdBy,
                      });
                      console.log(`[PandaDoc Webhook] Signed doc synced for new deal ${project.id}: action=${syncResult.action}, drive=${syncResult.driveSync}, onedrive=${syncResult.onedriveSync}`);
                    } catch (docErr: any) {
                      console.error('Failed to sync signed document for new deal:', docErr.message);
                    }
                  } else {
                    // Still try to create Drive folder even without signed PDF
                    try {
                      const { isDriveIntegrationEnabled, ensureProjectFolder } = await import('./services/googleDrive');
                      const driveEnabled = await isDriveIntegrationEnabled();
                      if (driveEnabled) {
                        ensureProjectFolder(project.id).catch((err: any) => {
                          console.error(`Drive folder creation failed for deal ${project.id}:`, err.message);
                        });
                      }
                    } catch (driveErr: any) {
                      console.error('Drive integration check error:', driveErr.message);
                    }
                  }
                } else {
                  console.log(`[PandaDoc Webhook] Project already exists for quote ${quote.id} (envelope ${envelope.id}), skipping auto-creation`);
                }
              }
            } catch (projectError) {
              console.error('[PandaDoc Webhook] Error creating project from signed term sheet:', projectError);
            }
          }

          // Insert signed PDF into existing deal's Stage 1 "Signed Agreement" slot and sync to cloud
          if (envelope.projectId && signedPdfPath && signedPdfSize > 0) {
            try {
              const { syncSignedDocumentToDeal } = await import('./services/signedDocumentSync');
              const syncResult = await syncSignedDocumentToDeal({
                projectId: envelope.projectId,
                envelopeId: envelope.id,
                externalDocumentId: documentId,
                documentName: envelope.documentName || 'Signed Document',
                signedPdfPath,
                fileSize: signedPdfSize,
                createdBy: envelope.createdBy,
              });
              console.log(`[PandaDoc Webhook] Signed doc synced for existing deal ${envelope.projectId}: action=${syncResult.action}, drive=${syncResult.driveSync}, onedrive=${syncResult.onedriveSync}`);
            } catch (existingDealErr: any) {
              console.error(`[PandaDoc Webhook] Error syncing signed doc into existing deal ${envelope.projectId}:`, existingDealErr.message);
            }
          }
        }
        
          if (event === 'document.viewed') {
            updates.viewedAt = new Date();
          }
          
          await db.update(esignEnvelopes)
            .set(updates)
            .where(eq(esignEnvelopes.id, envelope.id));
          
          await db.update(esignEvents)
            .set({ processed: true })
            .where(eq(esignEvents.id, eventRecord.id));
        } catch (procError: any) {
          processingError = procError.message || String(procError);
          console.error('[PandaDoc Webhook] Event processing error:', procError);
          await db.update(esignEvents)
            .set({ processed: false, error: processingError })
            .where(eq(esignEvents.id, eventRecord.id));
        }
      }
      
      res.json({ received: true });
    } catch (error: any) {
      console.error('PandaDoc webhook error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===================== Commercial Pre-Screener =====================

  const preScreenValidation = z.object({
    loanAmount: z.number().positive(),
    assetClass: z.string().min(1),
    propertyState: z.string().min(1),
    dealType: z.string().min(1),
    creditScore: z.string().min(1),
  });

  app.post('/api/commercial/pre-screen', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const parsed = preScreenValidation.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
      }

      const { loanAmount, assetClass, propertyState, dealType, creditScore } = parsed.data;

      const criteria = await storage.getSubmissionCriteria();

      let minLoan = 0;
      let maxLoan = Infinity;
      let approvedClasses: string[] = [];
      let approvedStates: string[] = [];

      for (const c of criteria) {
        if (c.criteriaType === 'min_loan_size') {
          minLoan = parseFloat(c.criteriaValue) || 0;
        } else if (c.criteriaType === 'max_loan_size') {
          maxLoan = parseFloat(c.criteriaValue) || Infinity;
        } else if (c.criteriaType === 'approved_asset_classes') {
          try { approvedClasses = JSON.parse(c.criteriaValue); } catch {}
        } else if (c.criteriaType === 'approved_states') {
          try { approvedStates = JSON.parse(c.criteriaValue); } catch {}
        }
      }

      const flags: string[] = [];
      if (loanAmount < minLoan) flags.push(`Loan amount $${loanAmount.toLocaleString()} is below minimum of $${minLoan.toLocaleString()}`);
      if (loanAmount > maxLoan) flags.push(`Loan amount $${loanAmount.toLocaleString()} exceeds maximum of $${maxLoan.toLocaleString()}`);
      if (approvedClasses.length > 0 && !approvedClasses.includes(assetClass)) flags.push(`Asset class "${assetClass}" is not in approved list`);
      if (approvedStates.length > 0 && !approvedStates.includes(propertyState)) flags.push(`State "${propertyState}" is not in approved states`);

      const rulesDecision = flags.length === 0
        ? { decision: 'proceed' as const, reason: 'All criteria checks passed', encouragement: '' }
        : { decision: 'decline' as const, reason: flags.join('; '), encouragement: '' };

      if (criteria.length === 0) {
        return res.json(rulesDecision);
      }

      try {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });

        const prompt = `Review this pre-screener data:
Loan Amount: ${loanAmount}
Asset Class: ${assetClass}
State: ${propertyState}
Deal Type: ${dealType}
Credit Score: ${creditScore}

Our criteria:
Min Loan: $${minLoan}
Max Loan: $${maxLoan}
Approved Asset Classes: ${approvedClasses.join(', ')}
Approved States: ${approvedStates.join(', ')}

Quick rules check findings:
${flags.length > 0 ? flags.join('\n') : 'All checks passed'}

Return JSON only:
{
  "decision": "proceed" | "decline" | "borderline",
  "reason": "brief explanation for the broker",
  "encouragement": "optional motivational message if borderline"
}`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a commercial lending pre-screener. Analyze the deal data against the criteria and return a JSON decision. Return ONLY valid JSON, no markdown or extra text.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
        });

        const content = response.choices[0]?.message?.content?.trim() || '';
        const jsonMatch = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const aiResult = JSON.parse(jsonMatch);

        return res.json({
          decision: aiResult.decision || rulesDecision.decision,
          reason: aiResult.reason || rulesDecision.reason,
          encouragement: aiResult.encouragement || '',
        });
      } catch (aiError) {
        console.error('OpenAI pre-screen error, falling back to rules:', aiError);
        return res.json(rulesDecision);
      }
    } catch (error) {
      console.error('Pre-screen error:', error);
      res.status(500).json({ error: 'Pre-screening failed' });
    }
  });

  // ===================== Commercial Deal Submission Routes =====================

  const commercialSubmissionValidation = z.object({
    submitterType: z.enum(["BROKER", "DEVELOPER"]),
    brokerOrDeveloperName: z.string().min(1),
    companyName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    roleOnDeal: z.string().min(1),
    loanType: z.enum(["BRIDGE", "LONG_TERM"]),
    requestedLoanAmount: z.number().positive(),
    requestedLTV: z.number().min(0).max(100).nullable().optional(),
    requestedLTC: z.number().min(0).max(100).nullable().optional(),
    interestOnly: z.boolean(),
    desiredCloseDate: z.string().min(1),
    exitStrategyType: z.enum(["SALE", "REFINANCE", "CONSTRUCTION_TO_PERM", "OTHER"]).nullable().optional(),
    exitStrategyDetails: z.string().nullable().optional(),
    propertyName: z.string().min(1),
    propertyAddress: z.string().min(1),
    city: z.string().min(1),
    state: z.string().length(2),
    zip: z.string().min(1),
    propertyType: z.enum(["SINGLE_FAMILY_RESIDENCE", "TWO_FOUR_UNIT", "MULTIFAMILY", "RENTAL_PORTFOLIO", "MIXED_USE", "INFILL_LOT", "LAND", "OFFICE", "RETAIL", "HOSPITALITY", "INDUSTRIAL", "MEDICAL", "AGRICULTURAL", "SPECIAL_PURPOSE"]),
    occupancyType: z.enum(["STABILIZED", "VALUE_ADD", "LEASE_UP", "GROUND_UP", "OTHER"]),
    unitsOrSqft: z.number().positive(),
    yearBuilt: z.number().nullable().optional(),
    purchasePrice: z.number().nullable().optional(),
    asIsValue: z.number().positive(),
    arvOrStabilizedValue: z.number().nullable().optional(),
    currentNOI: z.number().nullable().optional(),
    inPlaceRent: z.number().nullable().optional(),
    proFormaNOI: z.number().nullable().optional(),
    capexBudgetTotal: z.number().min(0),
    businessPlanSummary: z.string().min(50),
    primarySponsorName: z.string().min(1),
    primarySponsorExperienceYears: z.number().min(0),
    numberOfSimilarProjects: z.number().min(0),
    netWorth: z.number().positive(),
    liquidity: z.number().positive(),
  }).refine(data => data.requestedLTV || data.requestedLTC, {
    message: "At least one of LTV or LTC is required",
  }).refine(data => {
    if (data.loanType === "BRIDGE") {
      return !!data.exitStrategyType && !!data.exitStrategyDetails && data.exitStrategyDetails.length >= 20;
    }
    return true;
  }, {
    message: "Bridge loans require exit strategy type and details (min 20 characters)",
  });

  // Create a new commercial submission
  app.post('/api/commercial-submissions', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = commercialSubmissionValidation.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, code: "VALIDATION_ERROR", errors: parsed.error.errors });
      }

      const data = parsed.data;

      const submissionData: any = {
        userId: req.userId,
        status: "NEW",
        submitterType: data.submitterType,
        brokerOrDeveloperName: data.brokerOrDeveloperName,
        companyName: data.companyName,
        email: data.email,
        phone: data.phone,
        roleOnDeal: data.roleOnDeal,
        loanType: data.loanType,
        requestedLoanAmount: data.requestedLoanAmount,
        requestedLTV: data.requestedLTV || null,
        requestedLTC: data.requestedLTC || null,
        interestOnly: data.interestOnly,
        desiredCloseDate: new Date(data.desiredCloseDate),
        exitStrategyType: data.exitStrategyType || null,
        exitStrategyDetails: data.exitStrategyDetails || null,
        propertyName: data.propertyName,
        propertyAddress: data.propertyAddress,
        city: data.city,
        state: data.state,
        zip: data.zip,
        propertyType: data.propertyType,
        occupancyType: data.occupancyType,
        unitsOrSqft: data.unitsOrSqft,
        yearBuilt: data.yearBuilt || null,
        purchasePrice: data.purchasePrice || null,
        asIsValue: data.asIsValue,
        arvOrStabilizedValue: data.arvOrStabilizedValue || null,
        currentNOI: data.currentNOI || null,
        inPlaceRent: data.inPlaceRent || null,
        proFormaNOI: data.proFormaNOI || null,
        capexBudgetTotal: data.capexBudgetTotal,
        businessPlanSummary: data.businessPlanSummary,
        primarySponsorName: data.primarySponsorName,
        primarySponsorExperienceYears: data.primarySponsorExperienceYears,
        numberOfSimilarProjects: data.numberOfSimilarProjects,
        netWorth: data.netWorth,
        liquidity: data.liquidity,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      // Check required documents are uploaded (passed as documentIds in body)
      const documentIds: number[] = req.body.documentIds || [];
      const requiredDocTypes = ["SREO", "PFS", "BUDGET"];
      if (data.loanType === "BRIDGE") {
        requiredDocTypes.push("TRACK_RECORD");
      }

      // Validate docs if documentIds provided
      if (documentIds.length > 0) {
        // Will be checked after creation against linked docs
      }

      const submission = await storage.createCommercialSubmission(submissionData);

      // If documentIds provided, update them to link to this submission 
      // (docs were uploaded to a draft/temp ID, now link them)

      res.json({ success: true, submissionId: submission.id });
    } catch (error: any) {
      console.error("Error creating commercial submission:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Upload a document for a commercial submission
  app.post('/api/commercial-submissions/:id/documents', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const submissionId = parseInt(req.params.id);
      const submission = await storage.getCommercialSubmissionById(submissionId);
      
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      if (submission.userId !== req.userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const { docType, storageKey, originalFileName, mimeType, fileSize } = req.body;

      const validDocTypes = ["SREO", "PFS", "TRACK_RECORD", "BUDGET", "APPRAISAL"];
      if (!validDocTypes.includes(docType)) {
        return res.status(400).json({ error: "Invalid document type" });
      }

      const validMimeTypes = [
        "application/pdf",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ];
      if (!validMimeTypes.includes(mimeType)) {
        return res.status(400).json({ error: "Only PDF, XLS, and XLSX files are allowed" });
      }

      if (fileSize > 25 * 1024 * 1024) {
        return res.status(400).json({ error: "File size exceeds 25MB limit" });
      }

      const doc = await storage.addCommercialSubmissionDocument({
        submissionId,
        docType,
        storageKey,
        originalFileName,
        mimeType,
        fileSize,
      });

      res.json({ success: true, document: doc });
    } catch (error: any) {
      console.error("Error uploading commercial submission document:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a document from a commercial submission
  app.delete('/api/commercial-submissions/:id/documents/:docId', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const submissionId = parseInt(req.params.id);
      const docId = parseInt(req.params.docId);
      const submission = await storage.getCommercialSubmissionById(submissionId);
      
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      if (submission.userId !== req.userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      await storage.deleteCommercialSubmissionDocument(docId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting commercial submission document:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get documents for a submission
  app.get('/api/commercial-submissions/:id/documents', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const submissionId = parseInt(req.params.id);
      const submission = await storage.getCommercialSubmissionById(submissionId);
      
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const user = await storage.getUserById(req.userId!);
      const isAdmin = user?.role && ['admin', 'staff', 'super_admin'].includes(user.role);
      if (submission.userId !== req.userId && !isAdmin) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const docs = await storage.getCommercialSubmissionDocuments(submissionId);
      res.json(docs);
    } catch (error: any) {
      console.error("Error fetching commercial submission documents:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's own submissions
  app.get('/api/commercial-submissions', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const submissions = await storage.getCommercialSubmissionsByUser(req.userId!);
      res.json(submissions);
    } catch (error: any) {
      console.error("Error fetching commercial submissions:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get a specific submission (user)
  app.get('/api/commercial-submissions/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const submission = await storage.getCommercialSubmissionById(id);
      
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const user = await storage.getUserById(req.userId!);
      const isAdmin = user?.role && ['admin', 'staff', 'super_admin'].includes(user.role);
      if (submission.userId !== req.userId && !isAdmin) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const docs = await storage.getCommercialSubmissionDocuments(id);
      res.json({ ...submission, documents: docs });
    } catch (error: any) {
      console.error("Error fetching commercial submission:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Finalize/submit a commercial submission (checks all required docs)
  app.post('/api/commercial-submissions/:id/submit', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const submission = await storage.getCommercialSubmissionById(id);
      
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      if (submission.userId !== req.userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const docs = await storage.getCommercialSubmissionDocuments(id);
      const uploadedTypes = docs.map(d => d.docType);

      const requiredDocs = ["SREO", "PFS", "BUDGET"];
      if (submission.loanType === "BRIDGE") {
        requiredDocs.push("TRACK_RECORD");
      }

      const missingDocs = requiredDocs.filter(dt => !uploadedTypes.includes(dt));
      if (missingDocs.length > 0) {
        return res.status(400).json({
          success: false,
          code: "MISSING_REQUIRED_DOCS",
          missingDocs,
          message: `Missing required documents: ${missingDocs.join(", ")}`,
        });
      }

      await storage.updateCommercialSubmissionStatus(id, "NEW");

      // Send broker confirmation + admin notification (fire and forget)
      sendCommercialNotification('submission_received', submission).catch(() => {});
      sendCommercialNotification('admin_new_submission', submission).catch(() => {});

      // Trigger AI review in background (fire and forget)
      const submissionId = id;
      (async () => {
        try {
          const { reviewCommercialSubmission } = await import('./services/commercialAiReview');
          const result = await reviewCommercialSubmission(submissionId);
          await storage.updateCommercialSubmission(submissionId, {
            aiDecision: result.decision,
            aiDecisionReason: result.reason,
            status: result.decision === 'auto_declined' ? 'DECLINED' : 
                    result.decision === 'auto_approved' ? 'APPROVED' : 'UNDER_REVIEW',
            reviewedAt: new Date(),
          });

          if (result.decision === 'needs_review') {
            const updatedSub = await storage.getCommercialSubmissionById(submissionId);
            if (updatedSub) {
              sendCommercialNotification('admin_needs_review', updatedSub, { reason: result.reason }).catch(() => {});
            }
          }
        } catch (err) {
          console.error('AI review failed for submission', submissionId, err);
        }
      })();

      res.json({ success: true, submissionId: id });
    } catch (error: any) {
      console.error("Error finalizing commercial submission:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Get all commercial submissions
  app.get('/api/admin/commercial-submissions', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.userId!);
      const isAdmin = user?.role && ['admin', 'staff', 'super_admin'].includes(user.role);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const status = req.query.status as string | undefined;
      const submissions = await storage.getAllCommercialSubmissions(status);
      res.json(submissions);
    } catch (error: any) {
      console.error("Error fetching admin commercial submissions:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Get a specific commercial submission
  app.get('/api/admin/commercial-submissions/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.userId!);
      const isAdmin = user?.role && ['admin', 'staff', 'super_admin'].includes(user.role);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const submission = await storage.getCommercialSubmissionById(id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const docs = await storage.getCommercialSubmissionDocuments(id);
      res.json({ ...submission, documents: docs });
    } catch (error: any) {
      console.error("Error fetching admin commercial submission:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Update submission status
  app.patch('/api/admin/commercial-submissions/:id/status', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.userId!);
      const isAdmin = user?.role && ['admin', 'staff', 'super_admin'].includes(user.role);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const id = parseInt(req.params.id);
      const { status, adminNotes } = req.body;

      const validStatuses = ["NEW", "IN_REVIEW", "NEEDS_INFO", "DECLINED", "APPROVED"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const updated = await storage.updateCommercialSubmissionStatus(id, status, adminNotes);
      if (!updated) {
        return res.status(404).json({ error: "Submission not found" });
      }

      // Send notification based on status change (fire and forget)
      if (status === 'APPROVED') {
        sendCommercialNotification('submission_approved', updated, { adminNotes }).catch(() => {});
      } else if (status === 'DECLINED') {
        sendCommercialNotification('submission_declined', updated, { reason: adminNotes, adminNotes }).catch(() => {});
      } else if (status === 'NEEDS_INFO') {
        sendCommercialNotification('info_needed', updated, { message: adminNotes, adminNotes }).catch(() => {});
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating commercial submission status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Download a submission document
  app.get('/api/admin/commercial-submissions/:id/documents/:docId/download', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.userId!);
      const isAdmin = user?.role && ['admin', 'staff', 'super_admin'].includes(user.role);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const docId = parseInt(req.params.docId);
      const doc = await storage.getCommercialSubmissionDocumentById(docId);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(doc.storageKey);
      
      res.setHeader('Content-Disposition', `attachment; filename="${doc.originalFileName}"`);
      res.setHeader('Content-Type', doc.mimeType);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      console.error("Error downloading commercial submission document:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== COMMERCIAL SUBMISSION ADMIN CONFIG ROUTES ====================

  // --- Submission Criteria (Pre-screener config) ---
  app.get('/api/admin/commercial/criteria', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const criteria = await storage.getSubmissionCriteria();
      res.json(criteria);
    } catch (error: any) {
      console.error('Error fetching submission criteria:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/commercial/criteria', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertSubmissionCriteriaSchema.parse(req.body);
      const created = await storage.createSubmissionCriteria(parsed);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Error creating submission criteria:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/admin/commercial/criteria/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateSubmissionCriteria(id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating submission criteria:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/commercial/criteria/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSubmissionCriteria(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting submission criteria:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Submission Fields (Custom questions) ---
  app.get('/api/admin/commercial/fields', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const fields = await storage.getSubmissionFields();
      res.json(fields);
    } catch (error: any) {
      console.error('Error fetching submission fields:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/commercial/fields', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertSubmissionFieldSchema.parse(req.body);
      const created = await storage.createSubmissionField(parsed);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Error creating submission field:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/admin/commercial/fields/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateSubmissionField(id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating submission field:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/commercial/fields/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSubmissionField(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting submission field:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Submission Document Requirements ---
  app.get('/api/admin/commercial/document-requirements', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealType = req.query.dealType as string | undefined;
      const requirements = await storage.getSubmissionDocumentRequirements(dealType);
      res.json(requirements);
    } catch (error: any) {
      console.error('Error fetching document requirements:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/commercial/document-requirements', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertSubmissionDocumentRequirementSchema.parse(req.body);
      const created = await storage.createSubmissionDocumentRequirement(parsed);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Error creating document requirement:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/admin/commercial/document-requirements/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateSubmissionDocumentRequirement(id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating document requirement:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/commercial/document-requirements/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSubmissionDocumentRequirement(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting document requirement:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Submission Review Rules (AI rules config) ---
  app.get('/api/admin/commercial/review-rules', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const rules = await storage.getSubmissionReviewRules(category);
      res.json(rules);
    } catch (error: any) {
      console.error('Error fetching review rules:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/commercial/review-rules', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertSubmissionReviewRuleSchema.parse(req.body);
      const created = await storage.createSubmissionReviewRule(parsed);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Error creating review rule:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/admin/commercial/review-rules/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateSubmissionReviewRule(id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating review rule:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/commercial/review-rules/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSubmissionReviewRule(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting review rule:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Public criteria endpoint (broker-facing, requires login) ---
  app.get('/api/commercial/criteria', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const criteria = await storage.getSubmissionCriteria();
      const active = criteria.filter((c: any) => c.isActive !== false);
      res.json(active);
    } catch (error: any) {
      console.error('Error fetching public criteria:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Public document requirements endpoint (broker-facing, requires login) ---
  app.get('/api/commercial/document-requirements', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const dealType = req.query.dealType as string | undefined;
      const requirements = await storage.getSubmissionDocumentRequirements(dealType);
      const active = requirements.filter((r: any) => r.isActive !== false);
      res.json(active);
    } catch (error: any) {
      console.error('Error fetching public document requirements:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Public custom fields endpoint (broker-facing, requires login) ---
  app.get('/api/commercial/fields', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const dealType = req.query.dealType as string | undefined;
      const fields = await storage.getSubmissionFields(dealType);
      const active = fields.filter((f: any) => f.isActive !== false);
      res.json(active);
    } catch (error: any) {
      console.error('Error fetching public fields:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Enhanced commercial submission admin routes ---
  app.patch('/api/admin/commercial/submissions/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateCommercialSubmission(id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating commercial submission:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/commercial/submissions/:id/ai-reviews', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const submissionId = parseInt(req.params.id);
      const reviews = await storage.getSubmissionAiReviews(submissionId);
      res.json(reviews);
    } catch (error: any) {
      console.error('Error fetching AI reviews:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/commercial/submissions/:id/notes', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const submissionId = parseInt(req.params.id);
      const notes = await storage.getSubmissionNotes(submissionId);
      res.json(notes);
    } catch (error: any) {
      console.error('Error fetching submission notes:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/commercial/submissions/:id/notes', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const submissionId = parseInt(req.params.id);
      const { noteText } = req.body;
      if (!noteText) {
        return res.status(400).json({ error: 'noteText is required' });
      }
      const note = await storage.createSubmissionNote({
        submissionId,
        adminUserId: req.user!.id,
        noteText,
      });
      res.status(201).json(note);
    } catch (error: any) {
      console.error('Error creating submission note:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/commercial/submissions/:id/sponsors', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const submissionId = parseInt(req.params.id);
      const sponsors = await storage.getSubmissionSponsorsBySubmissionId(submissionId);
      res.json(sponsors);
    } catch (error: any) {
      console.error('Error fetching submission sponsors:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Manually trigger AI review for a submission
  app.post('/api/admin/commercial/submissions/:id/ai-review', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const submissionId = parseInt(req.params.id);
      const submission = await storage.getCommercialSubmissionById(submissionId);
      if (!submission) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      const { reviewCommercialSubmission } = await import('./services/commercialAiReview');
      const result = await reviewCommercialSubmission(submissionId);

      await storage.updateCommercialSubmission(submissionId, {
        aiDecision: result.decision,
        aiDecisionReason: result.reason,
        status: result.decision === 'auto_declined' ? 'DECLINED' :
                result.decision === 'auto_approved' ? 'APPROVED' : 'UNDER_REVIEW',
        reviewedAt: new Date(),
      });

      res.json(result);
    } catch (error: any) {
      console.error('Error running AI review:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Get AI review result for a submission
  app.get('/api/admin/commercial/submissions/:id/ai-review', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const submissionId = parseInt(req.params.id);
      const submission = await storage.getCommercialSubmissionById(submissionId);
      if (!submission) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      const aiReviews = await storage.getSubmissionAiReviews(submissionId);

      res.json({
        aiDecision: submission.aiDecision,
        aiDecisionReason: submission.aiDecisionReason,
        reviewedAt: submission.reviewedAt,
        reviews: aiReviews,
      });
    } catch (error: any) {
      console.error('Error fetching AI review:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===================== ALIAS ROUTES: /deals -> /projects (nomenclature consistency) =====================
  // Add a middleware that rewrites /api/deals to /api/projects for backward compatibility
  app.use((req: AuthRequest, res: Response, next: Function) => {
    if (req.path.startsWith('/api/deals')) {
      req.url = req.url.replace('/api/deals', '/api/projects');
    }
    next();
  });

  // Run expired submission check every hour
  setInterval(() => {
    checkExpiredSubmissions().catch(err => {
      console.error('Scheduled expiration check failed:', err);
    });
  }, 60 * 60 * 1000);

  // Run once on startup after a short delay
  setTimeout(() => {
    checkExpiredSubmissions().catch(err => {
      console.error('Initial expiration check failed:', err);
    });
  }, 10000);


  // ==================== PUBLIC APPLICATION ENDPOINTS ====================

  app.get('/api/public/programs', async (req: Request, res: Response) => {
    try {
      const programs = await db.select({
        id: loanPrograms.id,
        name: loanPrograms.name,
        description: loanPrograms.description,
        loanType: loanPrograms.loanType,
        minLoanAmount: loanPrograms.minLoanAmount,
        maxLoanAmount: loanPrograms.maxLoanAmount,
        eligiblePropertyTypes: loanPrograms.eligiblePropertyTypes,
        quoteFormFields: loanPrograms.quoteFormFields,
      })
        .from(loanPrograms)
        .where(eq(loanPrograms.isActive, true))
        .orderBy(loanPrograms.sortOrder);

      res.json({ programs });
    } catch (error) {
      console.error('Public programs error:', error);
      res.status(500).json({ error: 'Failed to get programs' });
    }
  });

  app.post('/api/public/apply', async (req: Request, res: Response) => {
    try {
      const { programId, firstName, lastName, email, phone, propertyAddress, formData } = req.body;

      if (!programId || !firstName || !lastName || !email || !propertyAddress) {
        return res.status(400).json({ error: 'Missing required fields: programId, firstName, lastName, email, propertyAddress' });
      }

      const [program] = await db.select()
        .from(loanPrograms)
        .where(and(eq(loanPrograms.id, programId), eq(loanPrograms.isActive, true)));

      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }

      let existingUser = await storage.getUserByEmail(email);
      if (!existingUser) {
        const randomPassword = Math.random().toString(36).slice(-12);
        const bcrypt = await import('bcrypt');
        const hashedPassword = await bcrypt.hash(randomPassword, 10);
        existingUser = await storage.createUser({
          email,
          password: hashedPassword,
          fullName: `${firstName} ${lastName}`,
          phone: phone || null,
          userType: 'borrower',
          role: 'user',
        });
      }

      const borrowerName = `${firstName} ${lastName}`.trim();
      const projectName = `${borrowerName} — ${propertyAddress}`;

      const [newProject] = await db.insert(projects).values({
        userId: existingUser.id,
        projectName,
        status: 'active',
        currentStage: 1,
        programId: program.id,
        propertyAddress,
      }).returning();

      await db.insert(activities).values({
        userId: existingUser.id,
        projectId: newProject.id,
        activityType: 'application_submitted',
        activityDescription: `Loan application submitted via public apply link for program: ${program.name}`,
      });

      const quote = await storage.createPricingRequest({
        userId: existingUser.id,
        customerFirstName: firstName,
        customerLastName: lastName,
        customerEmail: email,
        customerPhone: phone || null,
        propertyAddress,
        loanData: {
          programId,
          programName: program.name,
          loanType: program.loanType,
          source: 'public_apply',
          ...(formData || {}),
        },
        status: 'submitted',
      });

      res.json({
        success: true,
        message: 'Application submitted successfully',
        applicationId: newProject.id,
        dealIdentifier: newProject.loanNumber || `DEAL-${newProject.id}`,
      });
    } catch (error) {
      console.error('Public apply error:', error);
      res.status(500).json({ error: 'Failed to submit application' });
    }
  });

  // Branding endpoints
  app.get('/api/settings/branding', async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.getAllSettings();
      const brandingSettings = settings.filter(s => s.settingKey.startsWith('branding_'));

      const branding = {
        companyName: brandingSettings.find(s => s.settingKey === 'branding_company_name')?.settingValue ?? 'Lendry.AI',
        companyShortName: brandingSettings.find(s => s.settingKey === 'branding_company_short_name')?.settingValue ?? 'Lendry',
        copyrightYear: parseInt(brandingSettings.find(s => s.settingKey === 'branding_copyright_year')?.settingValue ?? new Date().getFullYear().toString()),
        emailSignature: brandingSettings.find(s => s.settingKey === 'branding_email_signature')?.settingValue ?? 'Lendry.AI',
        smsSignature: brandingSettings.find(s => s.settingKey === 'branding_sms_signature')?.settingValue ?? 'Lendry.AI',
        logoUrl: brandingSettings.find(s => s.settingKey === 'branding_logo_url')?.settingValue,
        logoDarkUrl: brandingSettings.find(s => s.settingKey === 'branding_logo_dark_url')?.settingValue,
      };

      res.json(branding);
    } catch (error) {
      console.error('Error fetching branding settings:', error);
      res.status(500).json({ error: 'Failed to fetch branding settings' });
    }
  });

  app.post('/api/admin/settings/branding', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { companyName, companyShortName, copyrightYear, emailSignature, smsSignature, logoUrl, logoDarkUrl } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Upsert each setting
      const updates = [
        { key: 'branding_company_name', value: companyName },
        { key: 'branding_company_short_name', value: companyShortName },
        { key: 'branding_copyright_year', value: copyrightYear.toString() },
        { key: 'branding_email_signature', value: emailSignature },
        { key: 'branding_sms_signature', value: smsSignature },
        { key: 'branding_logo_url', value: logoUrl || '' },
        { key: 'branding_logo_dark_url', value: logoDarkUrl || '' },
      ];

      for (const { key, value } of updates) {
        await storage.upsertSetting(key, value, `Branding setting: ${key}`, userId);
      }

      res.json({ success: true, message: 'Branding settings updated' });
    } catch (error) {
      console.error('Error updating branding settings:', error);
      res.status(500).json({ error: 'Failed to update branding settings' });
    }
  });

  // Settings image upload (for logos, etc.)
  const settingsImageUpload = multer({
    dest: path.join(process.cwd(), 'uploads', 'temp'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files are allowed'));
    },
  });

  app.post('/api/admin/settings/upload-image', authenticateUser, requireAdmin, settingsImageUpload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }
      const fs = await import('fs');
      const fileBuffer = await fs.promises.readFile(req.file.path);
      const objectStorageService = new ObjectStorageService();
      const { objectPath } = await objectStorageService.uploadFile(
        fileBuffer,
        req.file.originalname || 'logo.png',
        req.file.mimetype || 'image/png'
      );
      await fs.promises.unlink(req.file.path).catch(() => {});
      const publicUrl = `/api/storage/file?path=${encodeURIComponent(objectPath)}`;
      res.json({ url: publicUrl, objectPath });
    } catch (error) {
      console.error('Settings image upload error:', error);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  });

  // Serve storage files publicly (for logos etc.) - restricted to settings uploads only
  app.get('/api/storage/file', async (req: Request, res: Response) => {
    try {
      const objectPath = req.query.path as string;
      if (!objectPath) return res.status(400).json({ error: 'path query parameter is required' });
      const ALLOWED_PREFIXES = ['/objects/uploads/', 'uploads/'];
      const isAllowed = ALLOWED_PREFIXES.some(prefix => objectPath.startsWith(prefix));
      if (!isAllowed) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(objectPath);
      await svc.downloadObject(file, res, 86400);
    } catch (error: any) {
      console.error('Storage file serve error:', error?.message);
      if (!res.headersSent) {
        res.status(404).json({ error: 'File not found' });
      }
    }
  });

  // ===================== DEAL STATUS ENDPOINTS =====================

  app.get('/api/admin/deal-statuses', authenticateUser, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const statuses = await db.select().from(dealStatuses).orderBy(asc(dealStatuses.sortOrder));
      res.json(statuses);
    } catch (error) {
      console.error('Error fetching deal statuses:', error);
      res.status(500).json({ error: 'Failed to fetch deal statuses' });
    }
  });

  app.post('/api/admin/deal-statuses', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertDealStatusSchema.parse(req.body);
      const [status] = await db.insert(dealStatuses).values(data).returning();
      res.json(status);
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A status with that key already exists' });
      }
      console.error('Error creating deal status:', error);
      res.status(500).json({ error: 'Failed to create deal status' });
    }
  });

  app.put('/api/admin/deal-statuses/reorder', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { order } = req.body;
      if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of ids' });
      for (let i = 0; i < order.length; i++) {
        await db.update(dealStatuses).set({ sortOrder: i }).where(eq(dealStatuses.id, order[i]));
      }
      const allStatuses = await db.select().from(dealStatuses).orderBy(asc(dealStatuses.sortOrder));
      res.json(allStatuses);
    } catch (error) {
      console.error('Error reordering deal statuses:', error);
      res.status(500).json({ error: 'Failed to reorder deal statuses' });
    }
  });

  app.put('/api/admin/deal-statuses/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { label, color, description, isActive, sortOrder } = req.body;
      const [updated] = await db.update(dealStatuses)
        .set({ label, color, description, isActive, sortOrder })
        .where(eq(dealStatuses.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Status not found' });
      res.json(updated);
    } catch (error) {
      console.error('Error updating deal status:', error);
      res.status(500).json({ error: 'Failed to update deal status' });
    }
  });

  app.delete('/api/admin/deal-statuses/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const [status] = await db.select().from(dealStatuses).where(eq(dealStatuses.id, id));
      if (!status) return res.status(404).json({ error: 'Status not found' });
      if (status.isDefault) return res.status(400).json({ error: 'Cannot delete a default status' });
      await db.delete(dealStatuses).where(eq(dealStatuses.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting deal status:', error);
      res.status(500).json({ error: 'Failed to delete deal status' });
    }
  });

  // ===================== SHAREABLE LINK ENDPOINTS =====================

  app.post('/api/admin/projects/:id/generate-borrower-link', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (!projectId) {
        return res.status(400).json({ error: 'Project ID is required' });
      }

      const project = await storage.getProjectByIdInternal(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const token = uuidv4();
      const updated = await db.update(projects)
        .set({ borrowerPortalToken: token, lastUpdated: new Date() })
        .where(eq(projects.id, projectId))
        .returning();

      if (!updated[0]) {
        return res.status(500).json({ error: 'Failed to generate link' });
      }

      res.json({ token, url: `${req.protocol}://${req.get('host')}/portal/${token}` });
    } catch (error) {
      console.error('Generate borrower link error:', error);
      res.status(500).json({ error: 'Failed to generate borrower link' });
    }
  });

  app.post('/api/admin/projects/:id/generate-broker-link', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (!projectId) {
        return res.status(400).json({ error: 'Project ID is required' });
      }

      const project = await storage.getProjectByIdInternal(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const token = uuidv4();
      const updated = await db.update(projects)
        .set({ brokerPortalToken: token, lastUpdated: new Date() })
        .where(eq(projects.id, projectId))
        .returning();

      if (!updated[0]) {
        return res.status(500).json({ error: 'Failed to generate link' });
      }

      res.json({ token, url: `${req.protocol}://${req.get('host')}/broker-portal/${token}` });
    } catch (error) {
      console.error('Generate broker link error:', error);
      res.status(500).json({ error: 'Failed to generate broker link' });
    }
  });

  app.put('/api/admin/projects/:id/portal-settings', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const { borrowerPortalEnabled, brokerPortalEnabled } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: 'Project ID is required' });
      }

      const project = await storage.getProjectByIdInternal(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const updates: any = { lastUpdated: new Date() };
      if (borrowerPortalEnabled !== undefined) updates.borrowerPortalEnabled = borrowerPortalEnabled;
      if (brokerPortalEnabled !== undefined) updates.brokerPortalEnabled = brokerPortalEnabled;

      const updated = await db.update(projects)
        .set(updates)
        .where(eq(projects.id, projectId))
        .returning();

      if (!updated[0]) {
        return res.status(500).json({ error: 'Failed to update settings' });
      }

      res.json({
        borrowerPortalEnabled: updated[0].borrowerPortalEnabled,
        brokerPortalEnabled: updated[0].brokerPortalEnabled,
      });
    } catch (error) {
      console.error('Update portal settings error:', error);
      res.status(500).json({ error: 'Failed to update portal settings' });
    }
  });

  // ==================== SUPER ADMIN ROUTES ====================

  // Super Admin Dashboard - Get all platform stats and data
  app.get('/api/super-admin/dashboard', authenticateUser, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      // Get platform overview stats
      const totalLenderAccounts = await db.select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.role, 'admin'));

      const totalBrokers = await db.select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.userType, 'broker'));

      const totalBorrowers = await db.select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.userType, 'borrower'));

      const totalDeals = await db.select({ count: sql<number>`count(*)` })
        .from(projects);

      const totalVolume = await db.select({ sum: sql<number>`COALESCE(sum(loan_amount), 0)` })
        .from(projects);

      // Get lender accounts with team and deal stats
      const lenderAdmins = await db.select({
        id: users.id,
        companyName: users.companyName,
        adminName: users.fullName,
        adminEmail: users.email,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
        .from(users)
        .where(eq(users.role, 'admin'));

      const lenderAccounts = await Promise.all(lenderAdmins.map(async (admin) => {
        // Count team members from same company
        const teamCount = await db.select({ count: sql<number>`count(*)` })
          .from(users)
          .where(
            and(
              eq(users.companyName, admin.companyName!),
              or(
                eq(users.role, 'admin'),
                eq(users.role, 'staff'),
                eq(users.role, 'processor')
              )
            )
          );

        // Count active deals for this lender
        const dealsCount = await db.select({ count: sql<number>`count(*)` })
          .from(projects)
          .where(
            and(
              eq(projects.userId, admin.id),
              eq(projects.status, 'active')
            )
          );

        // Sum loan volume for this lender
        const volume = await db.select({ sum: sql<number>`COALESCE(sum(loan_amount), 0)` })
          .from(projects)
          .where(eq(projects.userId, admin.id));

        return {
          id: admin.id,
          companyName: admin.companyName || 'N/A',
          adminName: admin.adminName || 'N/A',
          adminEmail: admin.adminEmail,
          teamMembersCount: teamCount[0]?.count || 0,
          activeDealsCount: dealsCount[0]?.count || 0,
          totalLoanVolume: volume[0]?.sum || 0,
          isActive: admin.isActive,
          createdAt: admin.createdAt?.toISOString() || new Date().toISOString(),
        };
      }));

      // Get recent signups (last 10)
      const recentSignups = await db.select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        userType: users.userType,
        companyName: users.companyName,
        createdAt: users.createdAt,
      })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(10);

      // Get platform settings
      const settings = await db.select().from(platformSettings).limit(1);
      const platformSettingsData = settings[0] || {
        aiAgentsEnabled: true,
        commercialLendingEnabled: true,
        documentTemplatesEnabled: true,
        smartProspectingEnabled: false,
      };

      res.json({
        stats: {
          totalLenderAccounts: totalLenderAccounts[0]?.count || 0,
          totalBrokers: totalBrokers[0]?.count || 0,
          totalBorrowers: totalBorrowers[0]?.count || 0,
          totalDeals: totalDeals[0]?.count || 0,
          totalLoanVolume: totalVolume[0]?.sum || 0,
        },
        lenderAccounts,
        recentSignups: recentSignups.map(s => ({
          ...s,
          createdAt: s.createdAt?.toISOString() || new Date().toISOString(),
        })),
        platformSettings: {
          aiAgentsEnabled: platformSettingsData.aiAgentsEnabled,
          commercialLendingEnabled: platformSettingsData.commercialLendingEnabled,
          documentTemplatesEnabled: platformSettingsData.documentTemplatesEnabled,
          smartProspectingEnabled: platformSettingsData.smartProspectingEnabled,
        },
      });
    } catch (error) {
      console.error('Super admin dashboard error:', error);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  });

  // Super Admin Settings - Update platform-wide feature flags
  app.patch('/api/super-admin/settings', authenticateUser, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { aiAgentsEnabled, commercialLendingEnabled, documentTemplatesEnabled, smartProspectingEnabled } = req.body;

      // Get existing settings or create default
      let settings = await db.select().from(platformSettings).limit(1);

      const updates: any = {};
      if (aiAgentsEnabled !== undefined) updates.aiAgentsEnabled = aiAgentsEnabled;
      if (commercialLendingEnabled !== undefined) updates.commercialLendingEnabled = commercialLendingEnabled;
      if (documentTemplatesEnabled !== undefined) updates.documentTemplatesEnabled = documentTemplatesEnabled;
      if (smartProspectingEnabled !== undefined) updates.smartProspectingEnabled = smartProspectingEnabled;

      updates.updatedAt = new Date();
      updates.updatedBy = req.user!.id;

      if (settings.length === 0) {
        // Create new settings record
        const created = await db.insert(platformSettings)
          .values(updates)
          .returning();

        res.json({
          success: true,
          settings: {
            aiAgentsEnabled: created[0].aiAgentsEnabled,
            commercialLendingEnabled: created[0].commercialLendingEnabled,
            documentTemplatesEnabled: created[0].documentTemplatesEnabled,
            smartProspectingEnabled: created[0].smartProspectingEnabled,
          },
        });
      } else {
        // Update existing settings
        const updated = await db.update(platformSettings)
          .set(updates)
          .where(eq(platformSettings.id, settings[0].id))
          .returning();

        res.json({
          success: true,
          settings: {
            aiAgentsEnabled: updated[0].aiAgentsEnabled,
            commercialLendingEnabled: updated[0].commercialLendingEnabled,
            documentTemplatesEnabled: updated[0].documentTemplatesEnabled,
            smartProspectingEnabled: updated[0].smartProspectingEnabled,
          },
        });
      }
    } catch (error) {
      console.error('Super admin settings error:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // Migrate legacy status values to new standard (one-time)
  app.post('/api/admin/migrate-deal-statuses', authenticateUser, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const completedResult = await db.update(projects)
        .set({ status: 'closed' })
        .where(or(eq(projects.status, 'completed'), eq(projects.status, 'funded')));

      const cancelledResult = await db.update(projects)
        .set({ status: 'archived' })
        .where(eq(projects.status, 'cancelled'));

      res.json({
        success: true,
        message: 'Status migration complete',
        migratedToClosedFrom: ['completed', 'funded'],
        migratedToArchivedFrom: ['cancelled'],
      });
    } catch (error) {
      console.error('Status migration error:', error);
      res.status(500).json({ error: 'Failed to migrate statuses' });
    }
  });

  // ==================== DEAL MEMORY ENTRIES API ====================

  app.get('/api/admin/deals/:dealId/memory', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal ID' });

      const entries = await db
        .select({
          id: dealMemoryEntries.id,
          dealId: dealMemoryEntries.dealId,
          entryType: dealMemoryEntries.entryType,
          title: dealMemoryEntries.title,
          description: dealMemoryEntries.description,
          metadata: dealMemoryEntries.metadata,
          sourceType: dealMemoryEntries.sourceType,
          sourceUserId: dealMemoryEntries.sourceUserId,
          createdAt: dealMemoryEntries.createdAt,
          sourceUserFullName: users.fullName,
          sourceUserEmail: users.email,
        })
        .from(dealMemoryEntries)
        .leftJoin(users, eq(dealMemoryEntries.sourceUserId, users.id))
        .where(eq(dealMemoryEntries.dealId, dealId))
        .orderBy(desc(dealMemoryEntries.createdAt));

      res.json({ entries });
    } catch (error) {
      console.error('Get deal memory entries error:', error);
      res.status(500).json({ error: 'Failed to fetch memory entries' });
    }
  });

  app.post('/api/admin/deals/:dealId/memory', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal ID' });

      const body = insertDealMemoryEntrySchema.parse({
        ...req.body,
        dealId,
        sourceUserId: req.user!.id,
        sourceType: 'admin',
      });

      const [entry] = await db.insert(dealMemoryEntries).values(body).returning();
      res.json(entry);
    } catch (error) {
      console.error('Create deal memory entry error:', error);
      res.status(500).json({ error: 'Failed to create memory entry' });
    }
  });

  // ==================== DEAL NOTES API ====================

  app.get('/api/admin/deals/:dealId/notes', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal ID' });

      const notes = await db
        .select({
          id: dealNotes.id,
          dealId: dealNotes.dealId,
          userId: dealNotes.userId,
          content: dealNotes.content,
          noteType: dealNotes.noteType,
          mentions: dealNotes.mentions,
          isPinned: dealNotes.isPinned,
          parentNoteId: dealNotes.parentNoteId,
          createdAt: dealNotes.createdAt,
          updatedAt: dealNotes.updatedAt,
          authorId: users.id,
          authorFullName: users.fullName,
          authorEmail: users.email,
          authorRole: users.role,
        })
        .from(dealNotes)
        .leftJoin(users, eq(dealNotes.userId, users.id))
        .where(eq(dealNotes.dealId, dealId))
        .orderBy(asc(dealNotes.createdAt));

      res.json({ notes });
    } catch (error) {
      console.error('Get deal notes error:', error);
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  });

  app.post('/api/admin/deals/:dealId/notes', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal ID' });

      const { content, noteType, mentions, parentNoteId } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Content is required' });
      }

      const parsedMentions = mentions || [];
      const mentionMatches = content.match(/@[\w\s]+/g);
      if (mentionMatches && parsedMentions.length === 0) {
        const allUsers = await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users);
        for (const match of mentionMatches) {
          const name = match.slice(1).trim();
          const matchedUser = allUsers.find(u =>
            u.fullName?.toLowerCase() === name.toLowerCase() ||
            u.email?.split('@')[0].toLowerCase() === name.toLowerCase()
          );
          if (matchedUser) {
            parsedMentions.push({ userId: matchedUser.id, username: matchedUser.fullName || matchedUser.email });
          }
        }
      }

      const noteData = insertDealNoteSchema.parse({
        dealId,
        userId: req.user!.id,
        content,
        noteType: noteType || 'note',
        mentions: parsedMentions.length > 0 ? parsedMentions : null,
        isPinned: false,
        parentNoteId: parentNoteId || null,
      });

      const [note] = await db.insert(dealNotes).values(noteData).returning();

      const currentUser = await storage.getUserById(req.user!.id);
      const userName = currentUser?.fullName || currentUser?.email || 'Unknown';

      await db.insert(dealMemoryEntries).values({
        dealId,
        entryType: 'note_added',
        title: `Note by ${userName}`,
        description: content,
        sourceType: 'admin',
        sourceUserId: req.user!.id,
      });

      if (parsedMentions.length > 0) {
        const snippet = content.length > 80 ? content.substring(0, 80) + '...' : content;
        const mentionProj = await db.select({ loanNumber: projects.loanNumber }).from(projects).where(eq(projects.id, dealId)).limit(1);
        const mentionDealLabel = mentionProj[0]?.loanNumber || `DEAL-${dealId}`;
        for (const mention of parsedMentions) {
          if (mention.userId && mention.userId !== req.user!.id) {
            await createNotification({
              userId: mention.userId,
              type: 'mention_in_note',
              title: 'Mentioned in Note',
              message: `${userName} mentioned you in a note on ${mentionDealLabel}: "${snippet}"`,
              dealId,
              link: `/admin/deals/${dealId}`,
            });
          }
        }
      }

      const noteWithUser = {
        ...note,
        authorId: currentUser?.id,
        authorFullName: currentUser?.fullName,
        authorEmail: currentUser?.email,
        authorRole: currentUser?.role,
      };

      res.json(noteWithUser);
    } catch (error) {
      console.error('Create deal note error:', error);
      res.status(500).json({ error: 'Failed to create note' });
    }
  });

  app.put('/api/admin/deals/:dealId/notes/:noteId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const noteId = parseInt(req.params.noteId);
      if (isNaN(noteId)) return res.status(400).json({ error: 'Invalid note ID' });

      const [existing] = await db.select().from(dealNotes).where(eq(dealNotes.id, noteId));
      if (!existing) return res.status(404).json({ error: 'Note not found' });

      if (existing.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Only the note author can update this note' });
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (req.body.content !== undefined) updates.content = req.body.content;
      if (req.body.isPinned !== undefined) updates.isPinned = req.body.isPinned;

      const [updated] = await db.update(dealNotes).set(updates).where(eq(dealNotes.id, noteId)).returning();
      res.json(updated);
    } catch (error) {
      console.error('Update deal note error:', error);
      res.status(500).json({ error: 'Failed to update note' });
    }
  });

  app.delete('/api/admin/deals/:dealId/notes/:noteId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const noteId = parseInt(req.params.noteId);
      if (isNaN(noteId)) return res.status(400).json({ error: 'Invalid note ID' });

      const [existing] = await db.select().from(dealNotes).where(eq(dealNotes.id, noteId));
      if (!existing) return res.status(404).json({ error: 'Note not found' });

      const currentUser = await storage.getUserById(req.user!.id);
      if (existing.userId !== req.user!.id && currentUser?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only the note author or super admin can delete this note' });
      }

      await db.delete(dealNotes).where(eq(dealNotes.id, noteId));
      res.json({ success: true });
    } catch (error) {
      console.error('Delete deal note error:', error);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  });

  // ==================== DEAL TEAM (for @mention autocomplete) ====================

  app.get('/api/admin/deals/:dealId/team', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal ID' });

      const memberMap = new Map<number, { id: number; fullName: string | null; email: string; role: string }>();

      const processors = await db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          role: users.role,
        })
        .from(dealProcessors)
        .innerJoin(users, eq(dealProcessors.userId, users.id))
        .where(eq(dealProcessors.projectId, dealId));

      for (const p of processors) {
        memberMap.set(p.id, p);
      }

      const [project] = await db.select({ userId: projects.userId }).from(projects).where(eq(projects.id, dealId));
      if (project?.userId) {
        const [owner] = await db.select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role }).from(users).where(eq(users.id, project.userId));
        if (owner) memberMap.set(owner.id, owner);
      }

      const admins = await db
        .select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role })
        .from(users)
        .where(
          and(
            or(eq(users.role, 'admin'), eq(users.role, 'super_admin')),
            eq(users.isActive, true)
          )
        );

      for (const a of admins) {
        memberMap.set(a.id, a);
      }

      res.json({ members: Array.from(memberMap.values()) });
    } catch (error) {
      console.error('Get deal team error:', error);
      res.status(500).json({ error: 'Failed to fetch team members' });
    }
  });

  // ==================== SEED DEAL MEMORY FROM EXISTING DATA ====================

  app.post('/api/admin/deals/:dealId/memory/seed', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.dealId);
      if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal ID' });

      const existingEntries = await db.select({ id: dealMemoryEntries.id }).from(dealMemoryEntries).where(eq(dealMemoryEntries.dealId, dealId));
      if (existingEntries.length > 0) {
        return res.json({ message: 'Memory already seeded', count: existingEntries.length });
      }

      const entriesToInsert: any[] = [];

      const docs = await db.select().from(dealDocuments).where(eq(dealDocuments.dealId, dealId));
      for (const doc of docs) {
        if (doc.status === 'uploaded' || doc.status === 'approved' || doc.status === 'reviewed') {
          entriesToInsert.push({
            dealId,
            entryType: doc.status === 'approved' || doc.status === 'reviewed' ? 'document_approved' : 'document_received',
            title: `${doc.documentName || doc.documentCategory || 'Document'} ${doc.status === 'approved' || doc.status === 'reviewed' ? 'approved' : 'received'}`,
            description: doc.notes || undefined,
            sourceType: 'system',
            metadata: { documentId: doc.id, category: doc.documentCategory },
            createdAt: doc.updatedAt || doc.createdAt || new Date(),
          });
        } else if (doc.status === 'rejected') {
          entriesToInsert.push({
            dealId,
            entryType: 'document_rejected',
            title: `${doc.documentName || doc.documentCategory || 'Document'} rejected`,
            description: doc.notes || undefined,
            sourceType: 'system',
            metadata: { documentId: doc.id, category: doc.documentCategory },
            createdAt: doc.updatedAt || doc.createdAt || new Date(),
          });
        }
      }

      const activities = await db.select().from(projectActivity)
        .where(eq(projectActivity.projectId, dealId))
        .orderBy(asc(projectActivity.createdAt));

      for (const activity of activities) {
        if (activity.activityType === 'stage_changed' || activity.activityDescription?.includes('stage')) {
          entriesToInsert.push({
            dealId,
            entryType: 'stage_change',
            title: activity.activityDescription || 'Stage changed',
            sourceType: 'system',
            sourceUserId: activity.userId,
            createdAt: activity.createdAt || new Date(),
          });
        }
      }

      const digests = await db.select().from(digestHistory)
        .where(eq(digestHistory.projectId, dealId))
        .orderBy(asc(digestHistory.sentAt));

      for (const digest of digests) {
        entriesToInsert.push({
          dealId,
          entryType: 'digest_sent',
          title: `Digest sent via ${digest.deliveryMethod}`,
          description: `Sent to ${digest.recipientAddress} (${digest.documentsCount} docs, ${digest.updatesCount} updates)`,
          sourceType: 'system',
          metadata: { digestId: digest.id, deliveryMethod: digest.deliveryMethod },
          createdAt: digest.sentAt || new Date(),
        });
      }

      if (entriesToInsert.length > 0) {
        await db.insert(dealMemoryEntries).values(entriesToInsert);
      }

      res.json({ message: 'Memory seeded successfully', count: entriesToInsert.length });
    } catch (error) {
      console.error('Seed deal memory error:', error);
      res.status(500).json({ error: 'Failed to seed deal memory' });
    }
  });

  // ==================== NOTIFICATIONS API ====================

  async function createNotification(data: {
    userId: number;
    type: string;
    title: string;
    message: string;
    dealId?: number;
    link?: string;
  }) {
    try {
      const result = await db.insert(notifications).values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        dealId: data.dealId || null,
        link: data.link || null,
        isRead: false,
      }).returning();
      return result[0];
    } catch (err) {
      console.error('Failed to create notification:', err);
      return null;
    }
  }

  async function notifyDealAdmins(dealId: number, type: string, title: string, message: string, excludeUserId?: number) {
    try {
      const deal = await db.select().from(projects).where(eq(projects.id, dealId)).limit(1);
      if (!deal[0]) return;

      const adminUsers = await db.select({ id: users.id }).from(users)
        .where(or(eq(users.role, 'admin'), eq(users.role, 'super_admin'), eq(users.role, 'staff')));

      const processors = await db.select({ userId: dealProcessors.userId }).from(dealProcessors)
        .where(eq(dealProcessors.dealId, dealId));

      const notifyUserIds = new Set<number>();
      for (const admin of adminUsers) notifyUserIds.add(admin.id);
      for (const proc of processors) notifyUserIds.add(proc.userId);

      for (const uid of notifyUserIds) {
        if (excludeUserId && uid === excludeUserId) continue;
        await createNotification({
          userId: uid,
          type,
          title,
          message,
          dealId,
          link: `/admin/deals/${dealId}`,
        });
      }
    } catch (err) {
      console.error('Failed to notify deal admins:', err);
    }
  }

  app.get('/api/notifications', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const results = await db.select().from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({ notifications: results });
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  app.get('/api/notifications/unread-count', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const result = await db.select({ count: sql<number>`count(*)::int` }).from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

      res.json({ count: result[0]?.count || 0 });
    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  });

  app.post('/api/notifications/:id/read', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const notifId = parseInt(req.params.id);
      const userId = req.user!.id;

      await db.update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, notifId), eq(notifications.userId, userId)));

      res.json({ success: true });
    } catch (error) {
      console.error('Mark notification read error:', error);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  });

  app.post('/api/notifications/read-all', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      await db.update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

      res.json({ success: true });
    } catch (error) {
      console.error('Mark all read error:', error);
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  });

  // Message Templates CRUD
  app.get('/api/message-templates', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const templates = await storage.getMessageTemplates(req.user!.id);
      res.json({ templates });
    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({ error: 'Failed to get templates' });
    }
  });

  app.post('/api/message-templates', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertMessageTemplateSchema.safeParse({
        ...req.body,
        createdBy: req.user!.id,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid template data', details: parsed.error.flatten().fieldErrors });
      }
      const template = await storage.createMessageTemplate(parsed.data);
      res.json({ template });
    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({ error: 'Failed to create template' });
    }
  });

  app.put('/api/message-templates/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid template ID' });
      }
      const partial = insertMessageTemplateSchema.partial().safeParse(req.body);
      if (!partial.success) {
        return res.status(400).json({ error: 'Invalid template data', details: partial.error.flatten().fieldErrors });
      }
      const template = await storage.updateMessageTemplate(id, req.user!.id, partial.data);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json({ template });
    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json({ error: 'Failed to update template' });
    }
  });

  app.delete('/api/message-templates/:id', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid template ID' });
      }
      const deleted = await storage.deleteMessageTemplate(id, req.user!.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  });

  app.post('/api/admin/send-test-portal-link', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { email, dealId, portalType } = req.body;
      if (!email || !dealId || !portalType) {
        return res.status(400).json({ error: 'Email, dealId, and portalType are required' });
      }
      if (!['borrower', 'broker'].includes(portalType)) {
        return res.status(400).json({ error: 'portalType must be borrower or broker' });
      }

      const project = await storage.getProjectByIdInternal(dealId);
      if (!project) {
        return res.status(404).json({ error: 'Deal not found' });
      }

      const { v4: uuidv4Gen } = await import('uuid');
      const token = uuidv4Gen();
      const tokenField = portalType === 'borrower' ? 'borrowerPortalToken' : 'brokerPortalToken';
      await db.update(projects)
        .set({ [tokenField]: token, lastUpdated: new Date() })
        .where(eq(projects.id, dealId));

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const portalPath = portalType === 'borrower' ? 'portal' : 'broker-portal';
      const portalUrl = `${baseUrl}/${portalPath}/${token}`;
      const portalLabel = portalType === 'borrower' ? 'Borrower Portal' : 'Broker Portal';

      const brandingSettings = await storage.getAllSettings();
      const companyName = brandingSettings.find(s => s.settingKey === 'branding_company_name')?.settingValue || 'Lendry.AI';

      try {
        const { getResendClient } = await import('./email');
        const { client, fromEmail } = await getResendClient();
        await client.emails.send({
          from: fromEmail || `${companyName} <info@lendry.ai>`,
          to: email,
          subject: `[TEST] ${portalLabel} Preview - ${project.loanNumber || `DEAL-${dealId}`}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1e40af;">Test ${portalLabel} Link</h2>
              <p>This is a test email from ${companyName} to preview the ${portalLabel.toLowerCase()} experience.</p>
              <p><strong>Deal:</strong> ${project.loanNumber || `DEAL-${dealId}`}</p>
              <p><strong>Property:</strong> ${project.propertyAddress || 'N/A'}</p>
              <div style="margin: 24px 0;">
                <a href="${portalUrl}" style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Open ${portalLabel}
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px;">Or copy this link: <a href="${portalUrl}">${portalUrl}</a></p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
              <p style="color: #9ca3af; font-size: 12px;">This is a test email. The link above provides access to the ${portalLabel.toLowerCase()} for this deal.</p>
            </div>
          `,
        });
        res.json({ success: true, portalUrl, message: `Test ${portalLabel.toLowerCase()} link sent to ${email}` });
      } catch (emailError: any) {
        console.error('Failed to send test email:', emailError);
        res.json({ success: true, portalUrl, emailFailed: true, message: `Link generated but email failed to send. You can copy the link directly.` });
      }
    } catch (error) {
      console.error('Send test portal link error:', error);
      res.status(500).json({ error: 'Failed to send test portal link' });
    }
  });

  return httpServer;
}
