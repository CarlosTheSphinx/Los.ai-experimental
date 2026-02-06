# Loan Pricing White-Label Tool

## Overview

This project is a white-label loan pricing application designed for Sphinx Capital, enabling sales representatives to efficiently input loan details and retrieve interest rates. The system automates the submission of loan information to an external pricing provider using Apify's Puppeteer scraper, ensuring that proprietary pricing sources remain undisclosed to end-users.

The application comprises a React frontend for data entry, an Express backend for orchestrating pricing requests, and a PostgreSQL database for persisting quotes, agreements, and operational logs. It aims to streamline the loan pricing process, enhance sales efficiency, and provide comprehensive tools for managing quotes, agreements, and the entire loan closing lifecycle, including a borrower-facing portal and robust admin capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application is built with a modern web stack, utilizing React 18 with TypeScript for the frontend and Express.js with TypeScript for the backend. Data persistence is handled by PostgreSQL, accessed via Drizzle ORM.

**Frontend:**
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS with shadcn/ui components (New York style)
- **Animations**: Framer Motion
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

The frontend features a left sidebar navigation leading to key sections:
- **New Quote**: Loan pricing form with loan product type selector supporting two loan types:
  - **DSCR (Debt Service Coverage Ratio)**: Includes gross monthly rent, annual taxes/insurance, calculated DSCR ratio, LTV calculations.
  - **Fix and Flip / Ground Up Construction**: Full pricing system with wizard-style form covering:
    - **Loan Types**: Light Rehab (9.25%), Heavy Rehab (9.50%), Bridge No Rehab (9.25%), GUC (10.00%)
    - **Rate Adjusters**: Midstream (+0.25%), Cash-Out (+0.50%), Multifamily (+1.00%), FICO <700 (+0.25%)
    - **Disqualifiers**: 25+ rules covering loan limits, credit requirements, experience requirements, property rules, GUC-specific rules, entity requirements
    - **Leverage Caps**: Dynamic LTC/LTAIV/LTARV based on experience tier with overlay reductions
- **Saved Quotes**: Management of saved pricing quotes with document status.
- **Agreements**: Comprehensive agreement management including filtering, search, and detailed views with PDF viewer, field overlays, signers panel, and document timeline.
- **Projects**: Loan closing progress management with project cards, task checklists, activity timelines, document management, and borrower portal link sharing.
- **Borrower Portal**: A public, token-based portal for borrowers to view loan progress and tasks.
- **Admin Back Office**: A comprehensive set of tools for staff, including dashboards, user management, project oversight, system settings, partner management, and loan program configuration. This includes role-based access control with `user`, `staff`, `admin`, and `super_admin` roles.

**Backend:**
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **API Pattern**: RESTful endpoints
- **Validation**: Zod schemas (shared with frontend)
- **Authentication**: JWT tokens in httpOnly cookies with bcrypt password hashing, supporting multi-tenant authentication with data isolation.

**Authentication System:**
The system employs a robust authentication system supporting multi-tenancy and data isolation. It uses bcrypt for password hashing and JWT tokens in httpOnly cookies for session management. Public routes exist for registration, login, logout, and password recovery, while most API endpoints are protected, requiring authentication. Token-based access is implemented for document signing and the borrower portal.

**Google OAuth Login:**
Users can create accounts or sign in via Google OAuth 2.0. The flow uses `google-auth-library`:
- `GET /api/auth/google` — Redirects to Google consent screen
- `GET /api/auth/google/callback` — Handles the callback, finds or creates the user, issues JWT cookie, redirects to `/`
- Users table has `googleId` and `avatarUrl` columns; `passwordHash` is nullable for Google-only users
- If a user with the same email already exists (registered via password), their Google account is linked automatically
- Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment secrets
- Login and register pages show "Sign in/up with Google" buttons

**User Types and Onboarding System:**
The platform supports two user types with different experiences:
- **Brokers**: Full platform access after completing onboarding (partnership agreement + training). Navigation includes: New Quote, Saved Quotes, Agreements, Projects, Messages, Resources.
- **Borrowers**: Simplified dashboard showing their loans/projects with milestones. Navigation includes: My Loans, Messages, Resources. No onboarding required.

**Onboarding Flow (Brokers Only):**
- User type selection at registration (Broker/Borrower)
- Brokers must complete two steps before accessing the platform:
  1. Sign the Partnership Agreement (signature capture)
  2. Complete required training materials (documents, videos, links)
- Onboarding enforcement is applied both frontend (route protection) and backend (requireOnboarding middleware)
- Admins and borrowers are exempt from onboarding requirements
- Training materials accessible via Resources page after onboarding completion

**Admin Onboarding Management:**
- Admins can upload onboarding documents (partnership agreements, training docs, videos, links)
- View user onboarding completion status
- Track who has signed agreements and completed training
- Routes: /admin/onboarding for document management and user status

**Project System:**
A core feature is the project management system, which tracks the 9-stage loan closing process. Projects include tasks with priorities, borrower visibility flags, an activity timeline, and document management. Projects are automatically created upon agreement completion, populating data from linked quotes and enabling the borrower portal.

**Admin Back Office System:**
The admin system provides role-based access for managing users, deals, projects, partners, and loan programs. It includes an admin dashboard, a deals dashboard for tracking cumulative deals, user management, global project oversight, system settings configuration, and a partners management section. Loan programs can be configured with associated document and task templates, which auto-populate for new deals based on loan type.

**Data Flow:**
User input from the frontend is validated, then the backend triggers an Apify actor with loan parameters. The Apify script scrapes the external pricing provider, and the interest rate is returned to the user. Users can save quotes with customer details and commission calculations.

**Messaging System:**
The platform includes a deal-linked messaging system for communication between users and admins. All message threads must be linked to a specific deal (saved quote). Key features:
- **Message icons** on Saved Quotes, Agreements, and Projects for quick access
- **Deal-required threads**: Every conversation is linked to a deal for context
- **Automatic notifications**: System posts notifications to threads when documents are uploaded, deal stages change, or tasks are completed
- **Role-based access**: Admins can message any user; non-admins can only create threads for themselves (to message the lender)
- Message threads are stored in `message_threads` table with `dealId` (required), `userId`, and `subject`
- Individual messages stored in `messages` table with sender info and type (message/notification)

**Loan Digest Notification System:**
An automated notification system that sends periodic updates to borrowers and partners about their loan progress. Key features:
- **Per-loan/deal configuration**: Each deal or project can have its own digest settings
- **Configurable frequency**: Daily, every 2 days, every 3 days, weekly, or custom intervals (1-30 days)
- **Configurable time of day**: Choose when digests are sent (9am, 10am, etc.)
- **Multiple recipients**: Add borrowers, partners, or manual email/phone contacts
- **Delivery methods**: Email (via Resend), SMS (via Twilio), or both
- **Content options**: 
  - Documents needed (most important - shows outstanding/missing docs)
  - General updates (stage changes, status updates)
  - Notes and messages from the lender
- **Customizable message templates**: 
  - Edit email subject, email body, and SMS message
  - Available placeholders: {{recipientName}}, {{propertyAddress}}, {{documentsSection}}, {{updatesSection}}, {{documentsCount}}, {{portalLink}}
- **Digest history**: Track all sent digests with delivery status
- **Test digest**: Send a test to verify configuration
- Key tables: `loan_digest_configs`, `loan_digest_recipients`, `loan_updates`, `digest_history`, `digest_state`
- The `loan_updates` table serves as an event ledger - admin actions (stage changes, task completions, document requests) are logged here and included in the next digest
- Cron endpoint: POST `/api/cron/digests` (requires X-Cron-Key header)

**Partner Broadcast System:**
A mass communication feature allowing admins to send personalized emails and SMS to all active partners at once. Key features:
- **Broadcast composer**: Create messages with personalization placeholders ({{firstName}}, {{lastName}}, {{name}}, {{companyName}})
- **Dual delivery**: Send via email (Resend) and/or SMS (Twilio) simultaneously
- **Personalization**: Each message is customized with the partner's actual name and company
- **Delivery tracking**: Track emails sent, SMS sent, and failures per broadcast
- **Broadcast history**: View all past broadcasts with delivery statistics
- **SMS Inbox**: Receive and view SMS replies from partners with unread count badge
- **Twilio webhook**: Incoming SMS replies are captured at POST `/api/webhooks/twilio/sms`
- Key tables: `partner_broadcasts`, `partner_broadcast_recipients`, `inbound_sms_messages`

**Database Schema Highlights:**
Key tables include `users`, `pricing_requests`, `saved_quotes`, `documents`, `signers`, `document_fields`, `audit_logs`, `projects`, `project_stages`, `project_tasks`, `project_activity`, `project_documents`, `project_webhooks`, `system_settings`, `admin_tasks`, `admin_activity`, `partners`, `loanPrograms`, `programDocumentTemplates`, `programTaskTemplates`, `message_threads`, `messages`, `message_reads`, `onboardingDocuments`, `userOnboardingProgress`, `loan_digest_configs`, `loan_digest_recipients`, `loan_updates`, `digest_history`, `digest_state`, `partner_broadcasts`, `partner_broadcast_recipients`, and `inbound_sms_messages`. Foreign keys with CASCADE delete ensure data integrity and isolation.

## External Dependencies

- **Apify**: Cloud-based web scraping platform for automating interactions with external pricing providers.
- **PostgreSQL**: The primary relational database for all application data.

**Required Environment Variables:**
- `DATABASE_URL`: PostgreSQL connection string.
- `APIFY_TOKEN`: API token for Apify client.
- `JWT_SECRET`: Secret key for JWT token signing.
- `SESSION_SECRET`: Secret for session management.

**Optional Environment Variables (for Projects/Webhooks):**
- `N8N_WEBHOOK_URL`: Webhook URL for n8n automation.
- `EXTERNAL_LOS_WEBHOOK_URL`: Webhook URL for integration with an external Loan Origination System.
- `WEBHOOK_URLS`: JSON array of additional webhook endpoints.
- `BASE_URL`: Base URL for generating borrower portal links.

**PandaDoc Integration (Optional E-Sign):**
- `PANDADOC_API_KEY`: API key for PandaDoc integration (format: `API-Key xxxxx`)
- `PANDADOC_WEBHOOK_SECRET`: Secret for verifying webhook signatures (optional)

## PandaDoc Integration

The application supports PandaDoc as an alternative e-signing method alongside the built-in document signing workflow.

**How to Set Up PandaDoc:**
1. Create a PandaDoc account at https://pandadoc.com
2. Go to Settings → Integrations → API → Create API Key
3. Add the API key to your Replit Secrets as `PANDADOC_API_KEY`

**Creating PandaDoc Templates:**
1. In PandaDoc, create a new template
2. Add text tokens using the format `{{token_name}}` for fields that will be auto-populated
3. Common token names that map from quote data:
   - `{{borrower_name}}` - Full borrower name
   - `{{borrower_email}}` - Borrower email
   - `{{loan_amount}}` - Formatted loan amount (e.g., $400,000)
   - `{{interest_rate}}` - Interest rate percentage
   - `{{property_address}}` - Property address
   - `{{property_type}}` - Property type
   - `{{as_is_value}}` - As-is value (RTL loans)
   - `{{arv}}` - After repair value (RTL loans)
   - `{{ltv}}` - Loan-to-value ratio
   - `{{fico}}` - FICO score
   - `{{today_date}}` - Current date
4. Add signature fields and assign them to roles (e.g., "signer", "borrower")
5. Note the Template ID from Settings → Template Settings

**Using PandaDoc in the App:**
1. Go to Saved Quotes and click "Create Agreement"
2. Select the "PandaDoc" tab
3. Enter your PandaDoc Template ID
4. Configure recipients (name, email, role)
5. Choose send method (Email or Embedded)
6. Click "Create & Send Document"

**Webhooks (Optional):**
Configure PandaDoc webhooks to receive real-time status updates:
- Webhook URL: `https://your-app-url.replit.app/api/webhooks/pandadoc`
- Add `PANDADOC_WEBHOOK_SECRET` for signature verification

**Database Tables:**
- `esign_envelopes`: Tracks documents sent via PandaDoc (status, recipients, signed PDF URLs)
- `esign_events`: Logs webhook events and status changes