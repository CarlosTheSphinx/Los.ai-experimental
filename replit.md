# Loan Pricing White-Label Tool

## Overview

This is a white-label loan pricing application for Sphinx Capital that allows sales representatives to input loan details through a clean interface. The system automates form submission to an external pricing provider using Apify's Puppeteer scraper, returning interest rates without exposing the provider's website to end users.

The application consists of a React frontend for loan data entry, an Express backend that orchestrates pricing requests, and PostgreSQL for persisting quotes and request logs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Animations**: Framer Motion for page transitions
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

The frontend uses a left sidebar navigation (Shadcn Sidebar) with three main pages:
1. New Quote (/) - Loan pricing form with real-time LTV/DSCR calculations
2. Saved Quotes (/quotes) - View and manage saved pricing quotes with document status tracking
3. Agreements (/agreements) - Comprehensive agreement management with:
   - Filter tabs (All, Drafts, Sent, In Progress, Completed, Voided)
   - Search functionality
   - Actions dropdown (Resend, Remind, Edit & Resend, Void, Delete)
   - Click-through to agreement detail page

4. Agreement Detail (/agreements/:id) - Full document view with:
   - PDF viewer with page navigation and zoom
   - Field overlays showing signature positions
   - Signers panel with status and resend options
   - Document timeline (created, sent, completed, voided)
   - Actions (Resend All, Send Reminder, Void Document)

The signing page (/sign/:token) is rendered outside the sidebar layout for a focused signing experience.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **API Pattern**: REST endpoints defined in `shared/routes.ts`
- **Validation**: Zod schemas shared between frontend and backend

Key backend files:
- `server/routes.ts` - API endpoint handlers
- `server/storage.ts` - Database operations via Drizzle
- `server/db.ts` - Database connection setup

### External Automation
The core pricing functionality uses Apify's Puppeteer Scraper actor to:
1. Navigate to the pricing provider's website
2. Fill in loan form fields programmatically
3. Extract the resulting interest rate
4. Return results to the frontend

### Data Flow
1. User fills loan form on frontend
2. Form data validated with Zod schema
3. Backend triggers Apify actor with loan parameters
4. Puppeteer script fills external form and scrapes result
5. Interest rate returned to user
6. User can save quote with customer details and commission calculations

### Database Schema
Tables defined in `shared/schema.ts`:
- `pricing_requests` - Logs all pricing API requests with status
- `saved_quotes` - Stores saved quotes with customer info, loan data, and commission calculations
- `documents` - E-signature documents with status tracking (draft/sent/in_progress/completed/voided)
  - Fields: sentAt, completedAt, voidedAt, voidedReason for timeline tracking
- `signers` - Document signers with email, token, status, and lastReminderSent
- `document_fields` - Signature/form fields positioned on document pages
- `audit_logs` - Tracks all document actions for compliance

## External Dependencies

### Third-Party Services
- **Apify**: Cloud-based web scraping platform running Puppeteer scripts
- **PostgreSQL**: Primary database (requires DATABASE_URL environment variable)

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `APIFY_TOKEN` - API token for Apify client (has fallback in code)

### Key NPM Packages
- `apify-client` - Apify API integration
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `@tanstack/react-query` - Async state management
- `framer-motion` - Animation library
- `connect-pg-simple` - Session storage (available but may not be in use)