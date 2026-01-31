
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { ApifyClient } from 'apify-client';
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { sendSigningInvitation, sendCompletedDocument } from './email';

// Initialize Apify client
// In a real app, this should be an env var. Using the token from the provided code for fidelity.
const APIFY_TOKEN = process.env.APIFY_TOKEN || 'apify_api_BJJkrn8sbc0geOlnsjTdkgXQNXcbOq0AA0bj';
const client = new ApifyClient({ token: APIFY_TOKEN });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
          let parsedRate = parseFloat(result.interestRate.replace('%', ''));
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

  // Quotes API endpoints
  app.post(api.quotes.save.path, async (req, res) => {
    try {
      const quoteData = api.quotes.save.input.parse(req.body);
      
      // Server-side calculation of commission values
      const loanAmount = quoteData.loanData?.loanAmount || 0;
      const tpoPremiumPercent = quoteData.loanData?.tpoPremium ? parseFloat(String(quoteData.loanData.tpoPremium).replace('%', '')) : 0;
      
      const tpoPremiumAmount = (loanAmount * tpoPremiumPercent) / 100;
      const pointsAmount = (loanAmount * quoteData.pointsCharged) / 100;
      const totalRevenue = pointsAmount + tpoPremiumAmount;
      const commission = totalRevenue * 0.30;
      
      const saved = await storage.saveQuote({
        ...quoteData,
        pointsAmount,
        tpoPremiumAmount,
        totalRevenue,
        commission
      });
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

  app.get(api.quotes.list.path, async (req, res) => {
    try {
      const quotes = await storage.getQuotes();
      res.json({ success: true, quotes });
    } catch (error) {
      console.error('Error fetching quotes:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get('/api/quotes/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const quote = await storage.getQuoteById(id);
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

  app.delete('/api/quotes/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteQuote(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting quote:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ========== DOCUMENT SIGNING ENDPOINTS ==========

  // Create a new document (upload PDF)
  app.post('/api/documents', async (req, res) => {
    try {
      const { quoteId, name, fileName, fileData, pageCount } = req.body;
      
      if (!name || !fileName || !fileData) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const doc = await storage.createDocument({
        quoteId: quoteId || null,
        name,
        fileName,
        fileData,
        pageCount: pageCount || 1,
        status: 'draft'
      });

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
  app.get('/api/documents', async (req, res) => {
    try {
      const docs = await storage.getDocuments();
      res.json({ success: true, documents: docs });
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get document by ID
  app.get('/api/documents/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const doc = await storage.getDocumentById(id);
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

  // Get documents by quote ID
  app.get('/api/quotes/:quoteId/documents', async (req, res) => {
    try {
      const quoteId = parseInt(req.params.quoteId);
      const docs = await storage.getDocumentsByQuoteId(quoteId);
      res.json({ success: true, documents: docs });
    } catch (error) {
      console.error('Error fetching documents for quote:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete document
  app.delete('/api/documents/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteDocument(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Add signer to document
  app.post('/api/documents/:id/signers', async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const { name, email, color, signingOrder } = req.body;

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
  app.delete('/api/signers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSigner(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting signer:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Add field to document
  app.post('/api/documents/:id/fields', async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const { signerId, pageNumber, fieldType, x, y, width, height, required, label } = req.body;

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
  app.patch('/api/fields/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const field = await storage.updateField(id, updates);
      res.json({ success: true, field });
    } catch (error) {
      console.error('Error updating field:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete field
  app.delete('/api/fields/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteField(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting field:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Save all fields for a document (bulk update)
  app.post('/api/documents/:id/fields/bulk', async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const { fields } = req.body;

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
  app.post('/api/documents/:id/send', async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const { senderName } = req.body;
      
      const doc = await storage.getDocumentById(documentId);
      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const signers = await storage.getSignersByDocumentId(documentId);
      if (signers.length === 0) {
        res.status(400).json({ success: false, error: 'No signers added to document' });
        return;
      }

      const fields = await storage.getFieldsByDocumentId(documentId);
      if (fields.length === 0) {
        res.status(400).json({ success: false, error: 'No signature fields added to document' });
        return;
      }

      // Generate tokens for each signer and send emails
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const emailResults = [];

      for (const signer of signers) {
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await storage.updateSigner(signer.id, {
          token,
          tokenExpiresAt: expiresAt,
          status: 'sent'
        });

        const signingLink = `${baseUrl}/sign/${token}`;
        
        const emailResult = await sendSigningInvitation(
          signer.email,
          signer.name,
          doc.name,
          senderName || 'Sphinx Capital',
          signingLink
        );

        emailResults.push({ signerId: signer.id, email: signer.email, ...emailResult });
      }

      // Update document status
      await storage.updateDocumentStatus(documentId, 'sent');

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
  app.get('/api/documents/:id/download', async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      
      const doc = await storage.getDocumentById(documentId);
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
  app.get('/api/documents/:id/audit', async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const logs = await storage.getAuditLogsByDocumentId(documentId);
      res.json({ success: true, logs });
    } catch (error) {
      console.error('Error fetching audit log:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return httpServer;
}
