
import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { savedQuotes, users, dealDocuments, dealTasks, partners, loanPrograms, programDocumentTemplates, programTaskTemplates, pricingRulesets, ruleProposals, guidelineUploads, pricingQuoteLogs, pricingRulesSchema } from "@shared/schema";
import { priceQuote, validateRuleset, SAMPLE_RTL_RULESET, SAMPLE_DSCR_RULESET, type PricingInputs, analyzeGuidelines, refineProposal } from "./pricing";
import { getDocumentTemplatesForLoanType } from "./document-templates";
import { eq, desc, inArray, and } from "drizzle-orm";
import { api } from "@shared/routes";
import { ApifyClient } from 'apify-client';
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { sendSigningInvitation, sendCompletedDocument, sendVoidNotification, sendSigningReminder, sendPasswordResetEmail } from './email';
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
import { registerObjectStorageRoutes, ObjectStorageService } from './replit_integrations/object_storage';

// Initialize Apify client
// In a real app, this should be an env var. Using the token from the provided code for fidelity.
const APIFY_TOKEN = process.env.APIFY_TOKEN || 'apify_api_BJJkrn8sbc0geOlnsjTdkgXQNXcbOq0AA0bj';
const client = new ApifyClient({ token: APIFY_TOKEN });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ==================== OBJECT STORAGE ROUTES ====================
  registerObjectStorageRoutes(app);
  const objectStorageService = new ObjectStorageService();

  // ==================== ADDRESS AUTOCOMPLETE (PUBLIC) ====================
  
  app.get('/api/address/autocomplete', async (req: Request, res: Response) => {
    try {
      const { text } = req.query;
      
      if (!text || typeof text !== 'string' || text.length < 3) {
        return res.json({ features: [] });
      }
      
      const apiKey = process.env.GEOAPIFY_API_KEY;
      if (!apiKey) {
        console.error('GEOAPIFY_API_KEY not configured');
        return res.status(500).json({ error: 'Address service not configured' });
      }
      
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:us&format=json&apiKey=${apiKey}`
      );
      
      if (!response.ok) {
        throw new Error('Geoapify API error');
      }
      
      const data = await response.json();
      
      // Transform to match expected format
      const features = (data.results || []).map((result: any) => ({
        formatted: result.formatted,
        properties: {
          formatted: result.formatted,
          address_line1: result.address_line1,
          address_line2: result.address_line2,
          city: result.city,
          state: result.state,
          postcode: result.postcode,
          country: result.country,
        }
      }));
      
      res.json({ features });
    } catch (error) {
      console.error('Address autocomplete error:', error);
      res.status(500).json({ error: 'Failed to fetch address suggestions' });
    }
  });

  // ==================== AUTH ROUTES (PUBLIC) ====================
  
  // Register
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { email, password, fullName, firstName, lastName, companyName, phone } = req.body;
      
      // Support both fullName and firstName/lastName
      const resolvedFullName = fullName || (firstName && lastName ? `${firstName} ${lastName}` : null);
      
      if (!email || !password || !resolvedFullName) {
        return res.status(400).json({ error: 'Email, password, and name are required' });
      }
      
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      const existingUser = await storage.getUserByEmail(email.toLowerCase());
      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      
      const passwordHash = await hashPassword(password);
      
      const user = await storage.createUser({
        email: email.toLowerCase(),
        passwordHash,
        fullName: resolvedFullName,
        companyName: companyName || null,
        phone: phone || null,
        emailVerified: false,
        isActive: true,
        passwordResetToken: null,
        passwordResetExpires: null
      });
      
      const token = generateToken(user.id, user.email);
      setAuthCookie(res, token);
      
      // Parse firstName and lastName from fullName for response
      const respNameParts = user.fullName?.split(' ') || [];
      const respFirstName = respNameParts[0] || '';
      const respLastName = respNameParts.slice(1).join(' ') || '';
      
      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: respFirstName,
          lastName: respLastName,
          fullName: user.fullName,
          companyName: user.companyName
        },
        token
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Login
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      
      const user = await storage.getUserByEmail(email.toLowerCase());
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      
      if (!user.isActive) {
        return res.status(403).json({ error: 'Account has been deactivated' });
      }
      
      const isValid = await comparePassword(password, user.passwordHash);
      
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      
      await storage.updateUser(user.id, { lastLoginAt: new Date() });
      
      const token = generateToken(user.id, user.email);
      setAuthCookie(res, token);
      
      // Parse firstName and lastName from fullName
      const nameParts = user.fullName?.split(' ') || [];
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName,
          lastName,
          fullName: user.fullName,
          companyName: user.companyName
        },
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Logout
  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    clearAuthCookie(res);
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // Get current user
  app.get('/api/auth/me', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.user!.id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Parse firstName and lastName from fullName
      const nameParts = user.fullName?.split(' ') || [];
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName,
          lastName,
          fullName: user.fullName,
          companyName: user.companyName,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  // Admin authentication middleware - requires admin, staff, or super_admin role
  const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const user = await storage.getUserById(req.user.id);
      if (!user || !['admin', 'staff', 'super_admin'].includes(user.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      next();
    } catch (error) {
      console.error('Admin auth error:', error);
      res.status(500).json({ error: 'Authorization failed' });
    }
  };

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
          url: 'https://www.b-diya.nqxpricer.com/695e8559bfa826654b8fd62f'
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
                  
                  // Find matching option (flexible matching)
                  const match = options.find(opt => {
                    const text = opt.textContent.trim();
                    return text.toLowerCase().includes(valueText.toLowerCase()) || 
                           valueText.toLowerCase().includes(text.toLowerCase());
                  });
                  
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
                }
                
                // Wait for dropdown to fully close and clear from DOM
                try {
                  await page.waitForFunction(() => {
                    return document.querySelector('[role="listbox"]') === null;
                  }, { timeout: 2000 });
                } catch (e) {
                  // Fallback if listbox doesn't disappear
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
        commission
      }, req.user!.id);
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
      const { signerId, pageNumber, fieldType, x, y, width, height, required, label } = req.body;

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
        label
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
      console.log('Fields data:', JSON.stringify(fields, null, 2));

      // Delete existing fields
      await storage.deleteFieldsByDocumentId(documentId);

      // Create new fields
      const createdFields = [];
      for (const field of fields) {
        const created = await storage.createField({
          documentId,
          signerId: field.signerId || null,
          pageNumber: field.pageNumber || 1,
          fieldType: field.fieldType,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          required: field.required !== false,
          label: field.label
        });
        createdFields.push(created);
      }

      res.json({ success: true, fields: createdFields });
    } catch (error) {
      console.error('Error saving fields:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Send document for signing
  app.post('/api/documents/:id/send', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { senderName } = req.body;
      
      console.log(`📧 Send document request - ID: ${documentId}, Sender: ${senderName}`);
      
      if (!documentId || isNaN(documentId)) {
        console.error('Invalid document ID:', req.params.id);
        res.status(400).json({ success: false, error: 'Invalid document ID' });
        return;
      }
      
      // Verify user owns this document
      const doc = await storage.getDocumentById(documentId, userId);
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const signers = await storage.getSignersByDocumentId(documentId);
      console.log(`📧 Found ${signers.length} signers`);
      if (signers.length === 0) {
        res.status(400).json({ success: false, error: 'No signers added to document' });
        return;
      }

      const fields = await storage.getFieldsByDocumentId(documentId);
      console.log(`📧 Found ${fields.length} fields`);
      if (fields.length === 0) {
        res.status(400).json({ success: false, error: 'No signature fields added to document' });
        return;
      }

      // Generate tokens for each signer and send emails
      // Use the published production domain if available, otherwise fallback
      let baseUrl: string;
      if (process.env.REPLIT_DOMAINS) {
        // REPLIT_DOMAINS contains the published production domain
        const domains = process.env.REPLIT_DOMAINS.split(',');
        baseUrl = `https://${domains[0]}`;
      } else if (process.env.REPLIT_DEV_DOMAIN) {
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      } else {
        baseUrl = `${req.protocol}://${req.get('host')}`;
      }
      console.log(`📧 Base URL for signing links: ${baseUrl}`);
      const emailResults = [];

      for (const signer of signers) {
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        console.log(`📧 Processing signer: ${signer.name} (${signer.email})`);
        
        await storage.updateSigner(signer.id, {
          token,
          tokenExpiresAt: expiresAt,
          status: 'sent'
        });

        const signingLink = `${baseUrl}/sign/${token}`;
        console.log(`📧 Signing link: ${signingLink}`);
        
        console.log(`📧 Sending email to ${signer.email}...`);
        const emailResult = await sendSigningInvitation(
          signer.email,
          signer.name,
          doc.name,
          senderName || 'Sphinx Capital',
          signingLink
        );
        console.log(`📧 Email result:`, emailResult);

        emailResults.push({ signerId: signer.id, email: signer.email, ...emailResult });
      }

      // Update document status and sentAt
      await storage.updateDocument(documentId, {
        status: 'sent',
        sentAt: new Date()
      });

      await storage.createAuditLog({
        documentId,
        action: 'sent',
        details: `Document sent to ${signers.length} signer(s)`,
        ipAddress: req.ip
      });

      res.json({ success: true, emailResults });
    } catch (error) {
      console.error('Error sending document:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
          
          // Create stages and tasks from template
          const { LOAN_CLOSING_STAGES } = await import('./config/loanStages');
          
          for (const stageTemplate of LOAN_CLOSING_STAGES) {
            const stage = await storage.createProjectStage({
              projectId: project.id,
              stageName: stageTemplate.stage_name,
              stageKey: stageTemplate.stage_key,
              stageOrder: stageTemplate.stage_order,
              stageDescription: stageTemplate.stage_description,
              estimatedDurationDays: stageTemplate.estimated_duration_days,
              status: stageTemplate.stage_order === 1 ? 'in_progress' : 'pending',
              visibleToBorrower: stageTemplate.visible_to_borrower,
              startedAt: stageTemplate.stage_order === 1 ? new Date() : null,
            });
            
            for (const taskTemplate of stageTemplate.tasks) {
              await storage.createProjectTask({
                projectId: project.id,
                stageId: stage.id,
                taskTitle: taskTemplate.task_title,
                taskType: taskTemplate.task_type,
                priority: taskTemplate.priority,
                requiresDocument: taskTemplate.requires_document || false,
                visibleToBorrower: taskTemplate.visible_to_borrower,
                borrowerActionRequired: taskTemplate.borrower_action_required || false,
                status: 'pending',
              });
            }
          }
          
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
          totalSigners: docSigners.length,
          signedCount,
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
      
      res.json({ success: true, agreements });
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
            'Sphinx Capital',
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

  // Resend to all pending signers
  app.post('/api/esignature/agreements/:id/resend-all', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const { senderName } = req.body;
      
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
      
      const docSigners = await storage.getSignersByDocumentId(documentId);
      const pendingSigners = docSigners.filter(s => s.status !== 'signed');
      
      let resentCount = 0;
      // Use the published production domain if available
      let baseUrl: string;
      if (process.env.REPLIT_DOMAINS) {
        const domains = process.env.REPLIT_DOMAINS.split(',');
        baseUrl = `https://${domains[0]}`;
      } else if (process.env.REPLIT_DEV_DOMAIN) {
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else {
        baseUrl = 'http://localhost:5000';
      }
      
      for (const signer of pendingSigners) {
        if (signer.token) {
          const signingLink = `${baseUrl}/sign/${signer.token}`;
          
          try {
            await sendSigningInvitation(
              signer.email,
              signer.name,
              doc.name,
              senderName || 'Sphinx Capital',
              signingLink
            );
            
            await storage.updateSigner(signer.id, { 
              lastReminderSent: new Date(),
              status: 'sent'
            });
            resentCount++;
          } catch (emailError) {
            console.error('Failed to resend to', signer.email, emailError);
          }
        }
      }
      
      // Log action
      await storage.createAuditLog({
        documentId,
        action: 'resent_all',
        details: `Resent to ${resentCount} pending signers`
      });
      
      res.json({ 
        success: true, 
        resentCount,
        message: `Signing request resent to ${resentCount} signers` 
      });
    } catch (error) {
      console.error('Error resending to all:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Resend to individual signer
  app.post('/api/esignature/agreements/:id/resend-signer/:signerId', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const signerId = parseInt(req.params.signerId);
      const { senderName } = req.body;
      
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
      
      if (!signer.token) {
        return res.status(400).json({ 
          success: false, 
          error: 'Signer has no valid signing token' 
        });
      }
      
      // Use the published production domain if available
      let baseUrl: string;
      if (process.env.REPLIT_DOMAINS) {
        const domains = process.env.REPLIT_DOMAINS.split(',');
        baseUrl = `https://${domains[0]}`;
      } else if (process.env.REPLIT_DEV_DOMAIN) {
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else {
        baseUrl = 'http://localhost:5000';
      }
      const signingLink = `${baseUrl}/sign/${signer.token}`;
      
      await sendSigningInvitation(
        signer.email,
        signer.name,
        doc.name,
        senderName || 'Sphinx Capital',
        signingLink
      );
      
      await storage.updateSigner(signer.id, { 
        lastReminderSent: new Date(),
        status: 'sent'
      });
      
      // Log action
      await storage.createAuditLog({
        documentId,
        signerId: signer.id,
        action: 'resent',
        details: `Resent to ${signer.name} (${signer.email})`
      });
      
      res.json({ 
        success: true, 
        message: `Email resent to ${signer.name}` 
      });
    } catch (error) {
      console.error('Error resending to signer:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Send reminder to all pending signers
  app.post('/api/esignature/agreements/:id/remind', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const { senderName } = req.body;
      
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
      
      const docSigners = await storage.getSignersByDocumentId(documentId);
      const pendingSigners = docSigners.filter(s => s.status !== 'signed');
      
      let reminderCount = 0;
      // Use the published production domain if available
      let baseUrl: string;
      if (process.env.REPLIT_DOMAINS) {
        const domains = process.env.REPLIT_DOMAINS.split(',');
        baseUrl = `https://${domains[0]}`;
      } else if (process.env.REPLIT_DEV_DOMAIN) {
        baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else {
        baseUrl = 'http://localhost:5000';
      }
      
      for (const signer of pendingSigners) {
        if (signer.token) {
          const signingLink = `${baseUrl}/sign/${signer.token}`;
          
          try {
            await sendSigningReminder(
              signer.email,
              signer.name,
              doc.name,
              senderName || 'Sphinx Capital',
              signingLink
            );
            
            await storage.updateSigner(signer.id, { 
              lastReminderSent: new Date()
            });
            reminderCount++;
          } catch (emailError) {
            console.error('Failed to send reminder to', signer.email, emailError);
          }
        }
      }
      
      // Log action
      await storage.createAuditLog({
        documentId,
        action: 'reminder_sent',
        details: `Reminder sent to ${reminderCount} pending signers`
      });
      
      res.json({ 
        success: true, 
        reminderCount,
        message: `Reminder sent to ${reminderCount} signers` 
      });
    } catch (error) {
      console.error('Error sending reminders:', error);
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

  // ==================== PROJECTS ROUTES ====================

  // Get all projects
  app.get('/api/projects', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { status, archived } = req.query;
      
      const projectsList = await storage.getProjects(
        userId, 
        status as string | undefined, 
        archived !== undefined ? archived === 'true' : undefined
      );
      
      // Get task stats for each project
      const projectsWithStats = await Promise.all(
        projectsList.map(async (project) => {
          const stats = await storage.getProjectTaskStats(project.id);
          return {
            ...project,
            completedTasks: stats.completed,
            totalTasks: stats.total,
          };
        })
      );
      
      res.json({ projects: projectsWithStats });
    } catch (error) {
      console.error('Get projects error:', error);
      res.status(500).json({ error: 'Failed to get projects' });
    }
  });

  // Create new project manually
  app.post('/api/projects', authenticateUser, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const {
        projectName,
        loanAmount,
        interestRate,
        loanTermMonths,
        loanType,
        propertyAddress,
        propertyType,
        borrowerName,
        borrowerEmail,
        borrowerPhone,
        targetCloseDate,
        notes
      } = req.body;
      
      if (!projectName || !borrowerName || !borrowerEmail) {
        return res.status(400).json({ error: 'Project name, borrower name, and email are required' });
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
      
      // Create stages and tasks from template
      const { LOAN_CLOSING_STAGES } = await import('./config/loanStages');
      
      for (const stageTemplate of LOAN_CLOSING_STAGES) {
        const stage = await storage.createProjectStage({
          projectId: project.id,
          stageName: stageTemplate.stage_name,
          stageKey: stageTemplate.stage_key,
          stageOrder: stageTemplate.stage_order,
          stageDescription: stageTemplate.stage_description,
          estimatedDurationDays: stageTemplate.estimated_duration_days,
          status: stageTemplate.stage_order === 1 ? 'in_progress' : 'pending',
          visibleToBorrower: stageTemplate.visible_to_borrower,
          startedAt: stageTemplate.stage_order === 1 ? new Date() : null,
        });
        
        for (const taskTemplate of stageTemplate.tasks) {
          await storage.createProjectTask({
            projectId: project.id,
            stageId: stage.id,
            taskTitle: taskTemplate.task_title,
            taskType: taskTemplate.task_type,
            priority: taskTemplate.priority,
            requiresDocument: taskTemplate.requires_document || false,
            visibleToBorrower: taskTemplate.visible_to_borrower,
            borrowerActionRequired: taskTemplate.borrower_action_required || false,
            status: 'pending',
          });
        }
      }
      
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
      
      const stages = await storage.getStagesByProjectId(projectId);
      const tasks = await storage.getTasksByProjectId(projectId);
      const activity = await storage.getActivityByProjectId(projectId);
      const documents = await storage.getDocumentsByProjectId(projectId);
      
      // Group tasks by stage
      const stagesWithTasks = stages.map(stage => ({
        ...stage,
        tasks: tasks.filter(t => t.stageId === stage.id),
      }));
      
      res.json({
        project,
        stages: stagesWithTasks,
        activity,
        documents,
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
  app.get('/api/portal/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      
      const project = await storage.getProjectByToken(token);
      if (!project) {
        return res.status(404).json({ error: 'Project not found or link is invalid' });
      }
      
      if (!project.borrowerPortalEnabled) {
        return res.status(403).json({ error: 'Borrower portal is disabled for this project' });
      }
      
      // Update last viewed timestamp
      await storage.updateProject(project.id, project.userId!, {
        borrowerPortalLastViewed: new Date(),
      });
      
      // Get stages with visible tasks only
      const stages = await storage.getStagesByProjectId(project.id);
      const tasks = await storage.getTasksByProjectId(project.id);
      const activity = await storage.getActivityByProjectId(project.id, true); // Only borrower-visible
      
      // Filter to borrower-visible stages and tasks
      const visibleStages = stages.filter(s => s.visibleToBorrower).map(stage => ({
        ...stage,
        tasks: tasks.filter(t => t.stageId === stage.id && t.visibleToBorrower),
      }));
      
      // Return limited project data
      res.json({
        project: {
          id: project.id,
          projectNumber: project.projectNumber,
          projectName: project.projectName,
          borrowerName: project.borrowerName,
          loanAmount: project.loanAmount,
          interestRate: project.interestRate,
          loanTermMonths: project.loanTermMonths,
          loanType: project.loanType,
          propertyAddress: project.propertyAddress,
          status: project.status,
          currentStage: project.currentStage,
          progressPercentage: project.progressPercentage,
          targetCloseDate: project.targetCloseDate,
          applicationDate: project.applicationDate,
          notes: project.notes,
        },
        stages: visibleStages,
        activity,
      });
    } catch (error) {
      console.error('Borrower portal error:', error);
      res.status(500).json({ error: 'Failed to load borrower portal' });
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
        role: u.role,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        emailVerified: u.emailVerified,
        isActive: u.isActive
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
      const { email, password, fullName, companyName, phone, role } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }
      
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(password, 10);
      
      const newUser = await storage.createUser({
        email,
        passwordHash,
        fullName: fullName || null,
        companyName: companyName || null,
        phone: phone || null,
        role: role || 'user',
        isActive: true,
        emailVerified: true,
      });
      
      await storage.createAdminActivity({
        userId: req.user!.id,
        actionType: 'user_created',
        actionDescription: `Created new user: ${email} with role ${role || 'user'}`,
      });
      
      res.json({ 
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          companyName: newUser.companyName,
          phone: newUser.phone,
          role: newUser.role,
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

  // Admin - Update user (role, active status)
  app.patch('/api/admin/users/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { role, isActive } = req.body;
      
      const updates: { role?: string; isActive?: boolean } = {};
      if (role !== undefined && ['user', 'admin', 'staff', 'super_admin'].includes(role)) {
        updates.role = role;
      }
      if (isActive !== undefined) {
        updates.isActive = isActive;
      }
      
      const updated = await storage.updateUser(userId, updates);
      
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Log admin activity
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
          isActive: updated.isActive
        }
      });
    } catch (error) {
      console.error('Admin update user error:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  // Admin - List all projects
  app.get('/api/admin/projects', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const stage = req.query.stage as string | undefined;
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      
      const projectsList = await storage.getAllProjects({ status, stage, userId });
      
      // Get owner info for each project
      const projectsWithOwners = await Promise.all(projectsList.map(async (p) => {
        let ownerName = 'Unknown';
        let ownerEmail = '';
        if (p.userId) {
          const owner = await storage.getUserById(p.userId);
          if (owner) {
            ownerName = owner.fullName || owner.email;
            ownerEmail = owner.email;
          }
        }
        return { ...p, ownerName, ownerEmail };
      }));
      
      res.json({ projects: projectsWithOwners });
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
      const project = await storage.getProjectById(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const stages = await storage.getStagesByProjectId(projectId);
      const tasks = await storage.getTasksByProjectId(projectId);
      const activity = await storage.getProjectActivity({ projectId });
      const adminTasks = await storage.getAdminTasksByProjectId(projectId);
      const adminActivityList = await storage.getAdminActivityByProjectId(projectId);
      
      // Get owner info
      let owner = null;
      if (project.userId) {
        const ownerData = await storage.getUserById(project.userId);
        if (ownerData) {
          owner = { id: ownerData.id, email: ownerData.email, fullName: ownerData.fullName };
        }
      }
      
      res.json({ project, stages, tasks, activity, adminTasks, adminActivity: adminActivityList, owner });
    } catch (error) {
      console.error('Admin project detail error:', error);
      res.status(500).json({ error: 'Failed to load project' });
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
  app.get('/api/admin/deals', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { search, status } = req.query;
      
      // Get all quotes across all users
      const allQuotes = await db.select({
        id: savedQuotes.id,
        userId: savedQuotes.userId,
        partnerId: savedQuotes.partnerId,
        partnerName: savedQuotes.partnerName,
        customerFirstName: savedQuotes.customerFirstName,
        customerLastName: savedQuotes.customerLastName,
        propertyAddress: savedQuotes.propertyAddress,
        loanData: savedQuotes.loanData,
        interestRate: savedQuotes.interestRate,
        pointsCharged: savedQuotes.pointsCharged,
        pointsAmount: savedQuotes.pointsAmount,
        tpoPremiumAmount: savedQuotes.tpoPremiumAmount,
        totalRevenue: savedQuotes.totalRevenue,
        commission: savedQuotes.commission,
        stage: savedQuotes.stage,
        createdAt: savedQuotes.createdAt,
        userName: users.fullName,
        userEmail: users.email,
        partnerData: partners,
      })
        .from(savedQuotes)
        .leftJoin(users, eq(savedQuotes.userId, users.id))
        .leftJoin(partners, eq(savedQuotes.partnerId, partners.id))
        .orderBy(desc(savedQuotes.createdAt));
      
      // Map partner data to deals
      const quotesWithPartners = allQuotes.map(q => ({
        ...q,
        partner: q.partnerData ? {
          id: q.partnerData.id,
          name: q.partnerData.name,
          companyName: q.partnerData.companyName,
        } : null,
        partnerData: undefined,
      }));
      
      // Filter by search term if provided
      let filteredQuotes = quotesWithPartners;
      if (search) {
        const searchLower = (search as string).toLowerCase();
        filteredQuotes = quotesWithPartners.filter(q => 
          q.customerFirstName?.toLowerCase().includes(searchLower) ||
          q.customerLastName?.toLowerCase().includes(searchLower) ||
          q.propertyAddress?.toLowerCase().includes(searchLower) ||
          q.userName?.toLowerCase().includes(searchLower) ||
          q.partner?.name?.toLowerCase().includes(searchLower) ||
          q.partnerName?.toLowerCase().includes(searchLower)
        );
      }
      
      // Calculate stats
      const totalDeals = allQuotes.length;
      const totalLoanAmount = allQuotes.reduce((sum, q) => {
        const loanData = q.loanData as any;
        return sum + (loanData?.loanAmount || 0);
      }, 0);
      const totalRevenue = allQuotes.reduce((sum, q) => sum + (q.totalRevenue || 0), 0);
      const totalCommission = allQuotes.reduce((sum, q) => sum + (q.commission || 0), 0);
      
      // Calculate pipeline by loan type
      const loanTypeStats: Record<string, { count: number; amount: number }> = {};
      allQuotes.forEach(q => {
        const loanData = q.loanData as any;
        const loanType = loanData?.loanType || 'Unknown';
        if (!loanTypeStats[loanType]) {
          loanTypeStats[loanType] = { count: 0, amount: 0 };
        }
        loanTypeStats[loanType].count++;
        loanTypeStats[loanType].amount += loanData?.loanAmount || 0;
      });
      
      // Calculate pipeline by stage
      const stageOrder = ['initial-review', 'term-sheet', 'onboarding', 'processing', 'underwriting', 'closing', 'closed'];
      const stageLabels: Record<string, string> = {
        'initial-review': 'Initial Review',
        'term-sheet': 'Term Sheet',
        'onboarding': 'Onboarding',
        'processing': 'Processing',
        'underwriting': 'Underwriting',
        'closing': 'Closing',
        'closed': 'Closed'
      };
      const stageStats = stageOrder.map(stage => ({
        stage,
        label: stageLabels[stage],
        count: allQuotes.filter(q => q.stage === stage).length
      }));
      
      // Calculate deals by month (last 6 months)
      const now = new Date();
      const monthlyStats: { month: string; count: number; amount: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const monthName = monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        
        const monthDeals = allQuotes.filter(q => {
          const created = new Date(q.createdAt!);
          return created >= monthDate && created <= monthEnd;
        });
        
        monthlyStats.push({
          month: monthName,
          count: monthDeals.length,
          amount: monthDeals.reduce((sum, q) => {
            const loanData = q.loanData as any;
            return sum + (loanData?.loanAmount || 0);
          }, 0)
        });
      }
      
      res.json({
        deals: filteredQuotes,
        stats: {
          totalDeals,
          totalLoanAmount,
          totalRevenue,
          totalCommission,
          loanTypeStats,
          stageStats,
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
        propertyAddress, 
        loanAmount, 
        propertyValue, 
        interestRate, 
        loanType, 
        propertyType, 
        stage,
        partnerId,
        partnerName
      } = req.body;
      
      if (!customerFirstName || !customerLastName || !propertyAddress || !loanAmount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const loanAmountNum = parseFloat(loanAmount);
      const propertyValueNum = propertyValue ? parseFloat(propertyValue) : loanAmountNum * 1.25;
      const ltv = ((loanAmountNum / propertyValueNum) * 100).toFixed(0) + '%';
      
      const effectiveLoanType = loanType || 'rtl';
      
      const [deal] = await db.insert(savedQuotes).values({
        userId: req.user!.id,
        partnerId: partnerId ? parseInt(partnerId) : null,
        partnerName: partnerName || null,
        customerFirstName,
        customerLastName,
        propertyAddress,
        loanData: {
          loanAmount: loanAmountNum,
          propertyValue: propertyValueNum,
          ltv,
          loanType: effectiveLoanType,
          loanPurpose: 'purchase',
          propertyType: propertyType || 'single-family',
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
      
      // Try to get templates from an active program first
      const [activeProgram] = await db.select().from(loanPrograms)
        .where(and(
          eq(loanPrograms.loanType, effectiveLoanType),
          eq(loanPrograms.isActive, true)
        ))
        .limit(1);
      
      let documentEntries: any[] = [];
      let taskEntries: any[] = [];
      
      if (activeProgram) {
        // Get document templates from program
        const programDocs = await db.select().from(programDocumentTemplates)
          .where(eq(programDocumentTemplates.programId, activeProgram.id))
          .orderBy(programDocumentTemplates.sortOrder);
        
        documentEntries = programDocs.map((doc, index) => ({
          dealId: deal.id,
          documentName: doc.documentName,
          documentCategory: doc.documentCategory,
          documentDescription: doc.documentDescription,
          isRequired: doc.isRequired,
          sortOrder: doc.sortOrder || index,
          status: 'pending',
        }));
        
        // Get task templates from program
        const programTasks = await db.select().from(programTaskTemplates)
          .where(eq(programTaskTemplates.programId, activeProgram.id))
          .orderBy(programTaskTemplates.sortOrder);
        
        taskEntries = programTasks.map((task, index) => ({
          dealId: deal.id,
          taskName: task.taskName,
          taskDescription: task.taskDescription,
          priority: task.priority,
          status: 'pending',
        }));
      } else {
        // Fall back to hardcoded templates
        const documentTemplates = getDocumentTemplatesForLoanType(effectiveLoanType);
        documentEntries = documentTemplates.map((template, index) => ({
          dealId: deal.id,
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
      
      if (taskEntries.length > 0) {
        await db.insert(dealTasks).values(taskEntries);
      }
      
      res.json({ deal });
    } catch (error) {
      console.error('Admin create deal error:', error);
      res.status(500).json({ error: 'Failed to create deal' });
    }
  });

  // Admin - Get single deal by ID
  app.get('/api/admin/deals/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.id);
      
      const [deal] = await db.select({
        id: savedQuotes.id,
        userId: savedQuotes.userId,
        customerFirstName: savedQuotes.customerFirstName,
        customerLastName: savedQuotes.customerLastName,
        customerEmail: savedQuotes.customerEmail,
        customerPhone: savedQuotes.customerPhone,
        propertyAddress: savedQuotes.propertyAddress,
        loanData: savedQuotes.loanData,
        interestRate: savedQuotes.interestRate,
        pointsCharged: savedQuotes.pointsCharged,
        pointsAmount: savedQuotes.pointsAmount,
        tpoPremiumAmount: savedQuotes.tpoPremiumAmount,
        totalRevenue: savedQuotes.totalRevenue,
        commission: savedQuotes.commission,
        stage: savedQuotes.stage,
        createdAt: savedQuotes.createdAt,
        userName: users.fullName,
        userEmail: users.email,
      })
        .from(savedQuotes)
        .leftJoin(users, eq(savedQuotes.userId, users.id))
        .where(eq(savedQuotes.id, dealId))
        .limit(1);
      
      if (!deal) {
        return res.status(404).json({ error: 'Deal not found' });
      }
      
      const documents = await db.select()
        .from(dealDocuments)
        .where(eq(dealDocuments.dealId, dealId))
        .orderBy(dealDocuments.sortOrder);
      
      res.json({ deal, documents });
    } catch (error) {
      console.error('Admin get deal error:', error);
      res.status(500).json({ error: 'Failed to load deal' });
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
      const docId = parseInt(req.params.docId);
      const { status, reviewNotes } = req.body;
      
      const validStatuses = ['pending', 'uploaded', 'approved', 'rejected', 'not_applicable'];
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
      
      res.json({ document: updated });
    } catch (error) {
      console.error('Admin update document error:', error);
      res.status(500).json({ error: 'Failed to update document' });
    }
  });

  // Admin - Upload document file (request presigned URL)
  app.post('/api/admin/deals/:dealId/documents/:docId/upload-url', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const docId = parseInt(req.params.docId);
      const { name, size, contentType } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'File name is required' });
      }
      
      // Get presigned URL for upload
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      
      res.json({
        uploadURL,
        objectPath,
        docId,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error('Admin upload URL error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  // Admin - Complete document upload (update database after file is uploaded)
  app.post('/api/admin/deals/:dealId/documents/:docId/upload-complete', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const docId = parseInt(req.params.docId);
      const { objectPath, fileName, fileSize, mimeType } = req.body;
      
      if (!objectPath) {
        return res.status(400).json({ error: 'Object path is required' });
      }
      
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
      
      if (!updated) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      res.json({ document: updated });
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

  // Admin - Update deal stage
  app.patch('/api/admin/deals/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const dealId = parseInt(req.params.id);
      const { stage } = req.body;
      
      const validStages = ['initial-review', 'term-sheet', 'onboarding', 'processing', 'underwriting', 'closing', 'closed'];
      if (stage && !validStages.includes(stage)) {
        return res.status(400).json({ error: 'Invalid stage' });
      }
      
      const [updated] = await db.update(savedQuotes)
        .set({ stage })
        .where(eq(savedQuotes.id, dealId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Deal not found' });
      }
      
      res.json({ deal: updated });
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
      
      res.json({ deal: updated });
    } catch (error) {
      console.error('Admin full deal update error:', error);
      res.status(500).json({ error: 'Failed to update deal' });
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
      const taskId = parseInt(req.params.taskId);
      const { status, taskName, taskDescription, priority, assignedTo, dueDate } = req.body;
      
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
      const { documentName, documentCategory, documentDescription, isRequired } = req.body;
      
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
  app.get('/api/admin/partners', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
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

  // ==================== LOAN PROGRAMS ROUTES ====================
  
  // Get all loan programs with their document and task templates
  app.get('/api/admin/programs', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const programs = await db.select().from(loanPrograms).orderBy(loanPrograms.sortOrder);
      
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
      
      const documents = await db.select().from(programDocumentTemplates)
        .where(eq(programDocumentTemplates.programId, program.id))
        .orderBy(programDocumentTemplates.sortOrder);
      
      const tasks = await db.select().from(programTaskTemplates)
        .where(eq(programTaskTemplates.programId, program.id))
        .orderBy(programTaskTemplates.sortOrder);
      
      res.json({ program, documents, tasks });
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
        tasks
      } = req.body;
      
      if (!name || !loanType) {
        return res.status(400).json({ error: 'Name and loan type are required' });
      }
      
      // Use a transaction to ensure atomicity of program + templates creation
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
        }).returning();
        
        // Create inline document templates if provided
        if (documents && Array.isArray(documents) && documents.length > 0) {
          // Filter out documents with empty names
          const validDocs = documents.filter((doc: any) => doc.documentName?.trim());
          if (validDocs.length > 0) {
            const documentEntries = validDocs.map((doc: any, index: number) => ({
              programId: program.id,
              documentName: doc.documentName.trim(),
              documentCategory: doc.documentCategory || 'other',
              documentDescription: doc.documentDescription || null,
              isRequired: doc.isRequired !== false,
              sortOrder: index,
            }));
            await tx.insert(programDocumentTemplates).values(documentEntries);
          }
        }
        
        // Create inline task templates if provided
        if (tasks && Array.isArray(tasks) && tasks.length > 0) {
          // Filter out tasks with empty names
          const validTasks = tasks.filter((task: any) => task.taskName?.trim());
          if (validTasks.length > 0) {
            const taskEntries = validTasks.map((task: any, index: number) => ({
              programId: program.id,
              taskName: task.taskName.trim(),
              taskDescription: task.taskDescription || null,
              taskCategory: task.taskCategory || 'other',
              priority: task.priority || 'medium',
              sortOrder: index,
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
      const { 
        name, description, loanType, 
        minLoanAmount, maxLoanAmount, 
        minLtv, maxLtv, 
        minInterestRate, maxInterestRate,
        termOptions, eligiblePropertyTypes,
        isActive
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
      
      const [program] = await db.update(loanPrograms)
        .set(updateData)
        .where(eq(loanPrograms.id, parseInt(id)))
        .returning();
      
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
  
  // Delete loan program
  app.delete('/api/admin/programs/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
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
      const { documentName, documentCategory, documentDescription, isRequired, sortOrder } = req.body;
      
      if (!documentName || !documentCategory) {
        return res.status(400).json({ error: 'Document name and category are required' });
      }
      
      const [doc] = await db.insert(programDocumentTemplates).values({
        programId: parseInt(programId),
        documentName,
        documentCategory,
        documentDescription,
        isRequired: isRequired !== false,
        sortOrder: sortOrder || 0,
      }).returning();
      
      res.json({ document: doc });
    } catch (error) {
      console.error('Add program document error:', error);
      res.status(500).json({ error: 'Failed to add document template' });
    }
  });
  
  // Update document template
  app.put('/api/admin/programs/:programId/documents/:docId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { docId } = req.params;
      const { documentName, documentCategory, documentDescription, isRequired, sortOrder } = req.body;
      
      const updateData: any = {};
      if (documentName !== undefined) updateData.documentName = documentName;
      if (documentCategory !== undefined) updateData.documentCategory = documentCategory;
      if (documentDescription !== undefined) updateData.documentDescription = documentDescription;
      if (isRequired !== undefined) updateData.isRequired = isRequired;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      
      const [doc] = await db.update(programDocumentTemplates)
        .set(updateData)
        .where(eq(programDocumentTemplates.id, parseInt(docId)))
        .returning();
      
      res.json({ document: doc });
    } catch (error) {
      console.error('Update program document error:', error);
      res.status(500).json({ error: 'Failed to update document template' });
    }
  });
  
  // Delete document template
  app.delete('/api/admin/programs/:programId/documents/:docId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { docId } = req.params;
      
      await db.delete(programDocumentTemplates).where(eq(programDocumentTemplates.id, parseInt(docId)));
      
      res.json({ success: true });
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
      const { taskName, taskDescription, taskCategory, priority, sortOrder } = req.body;
      
      if (!taskName) {
        return res.status(400).json({ error: 'Task name is required' });
      }
      
      const [task] = await db.insert(programTaskTemplates).values({
        programId: parseInt(programId),
        taskName,
        taskDescription,
        taskCategory,
        priority: priority || 'medium',
        sortOrder: sortOrder || 0,
      }).returning();
      
      res.json({ task });
    } catch (error) {
      console.error('Add program task error:', error);
      res.status(500).json({ error: 'Failed to add task template' });
    }
  });
  
  // Update task template
  app.put('/api/admin/programs/:programId/tasks/:taskId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { taskId } = req.params;
      const { taskName, taskDescription, taskCategory, priority, sortOrder } = req.body;
      
      const updateData: any = {};
      if (taskName !== undefined) updateData.taskName = taskName;
      if (taskDescription !== undefined) updateData.taskDescription = taskDescription;
      if (taskCategory !== undefined) updateData.taskCategory = taskCategory;
      if (priority !== undefined) updateData.priority = priority;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      
      const [task] = await db.update(programTaskTemplates)
        .set(updateData)
        .where(eq(programTaskTemplates.id, parseInt(taskId)))
        .returning();
      
      res.json({ task });
    } catch (error) {
      console.error('Update program task error:', error);
      res.status(500).json({ error: 'Failed to update task template' });
    }
  });
  
  // Delete task template
  app.delete('/api/admin/programs/:programId/tasks/:taskId', authenticateUser, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { taskId } = req.params;
      
      await db.delete(programTaskTemplates).where(eq(programTaskTemplates.id, parseInt(taskId)));
      
      res.json({ success: true });
    } catch (error) {
      console.error('Delete program task error:', error);
      res.status(500).json({ error: 'Failed to delete task template' });
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
  app.post('/api/pricing/calculate', authenticateUser, async (req: AuthRequest, res: Response) => {
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
  app.post('/api/pricing/rtl', authenticateUser, async (req: AuthRequest, res: Response) => {
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
      // Get all active programs
      const programs = await db.select()
        .from(loanPrograms)
        .where(eq(loanPrograms.isActive, true))
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

  return httpServer;
}
