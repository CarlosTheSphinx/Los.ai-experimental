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

The frontend uses a left sidebar navigation (Shadcn Sidebar) with four main pages:
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

5. Projects (/projects) - Loan closing progress management with:
   - Project cards with progress bars and task counts
   - Filter tabs (All, Active, On Hold, Completed)
   - Search by project number, name, borrower, or address
   - New Project button for manual project creation

6. Project Detail (/projects/:id) - Full project management with:
   - Progress tracker showing 9-stage loan closing process
   - Task checklist organized by stage with priority badges
   - Activity timeline
   - Documents tab
   - Loan details (amount, rate, term, property info)
   - Borrower portal link sharing
   - Push to external LOS integration

7. Borrower Portal (/portal/:token) - Public portal for borrowers:
   - Token-based access (no login required)
   - Read-only view of loan progress and tasks
   - Only shows borrower-visible stages and tasks
   - Activity updates visible to borrowers

The signing page (/sign/:token) and borrower portal (/portal/:token) are rendered outside the sidebar layout for a focused experience.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **API Pattern**: REST endpoints defined in `shared/routes.ts`
- **Validation**: Zod schemas shared between frontend and backend
- **Authentication**: JWT tokens in httpOnly cookies with bcrypt password hashing

Key backend files:
- `server/routes.ts` - API endpoint handlers
- `server/storage.ts` - Database operations via Drizzle
- `server/db.ts` - Database connection setup
- `server/auth.ts` - Authentication utilities (password hashing, JWT generation/verification)
- `server/email.ts` - Email service for password reset notifications

### Authentication System
Multi-tenant authentication with complete data isolation:
- **Password Security**: bcrypt with 10 salt rounds
- **Session Management**: JWT tokens in httpOnly cookies with 7-day expiration
- **Cookie Settings**: secure=true in production, sameSite='lax'
- **Data Isolation**: All database queries filter by user_id

Auth Routes (Public):
- POST `/api/auth/register` - Register new user (accepts firstName/lastName or fullName)
- POST `/api/auth/login` - Login with email/password
- POST `/api/auth/logout` - Logout and clear session cookie
- GET `/api/auth/me` - Get current authenticated user
- POST `/api/auth/forgot-password` - Request password reset email
- POST `/api/auth/reset-password` - Reset password with token

Protected Routes (require authentication):
- All `/api/quotes/*` endpoints
- All `/api/documents/*` endpoints
- All `/api/esignature/agreements/*` endpoints
- All `/api/signers/*` and `/api/fields/*` endpoints

Public Routes (token-based or no auth):
- `/sign/:token` - Document signing page (uses signing token, not user auth)
- `/api/sign/:token` - Get signing data by token
- `/api/sign/:token/complete` - Complete document signing
- `/portal/:token` - Borrower portal page (uses borrower portal token)
- `/api/portal/:token` - Get borrower-visible project data

**Projects Routes (Protected):**
- GET `/api/projects` - List all projects with optional status/archived filters
- POST `/api/projects` - Create project manually
- GET `/api/projects/:id` - Get project with stages, tasks, activity
- PUT `/api/projects/:id` - Update project details
- PATCH `/api/projects/:projectId/tasks/:taskId` - Update task status
- GET `/api/projects/:id/borrower-link` - Get borrower portal URL
- PATCH `/api/projects/:id/toggle-portal` - Enable/disable borrower portal
- POST `/api/projects/:id/push-to-los` - Trigger external LOS webhook

**Admin Routes (Protected - requires admin/staff/super_admin role):**
- GET `/api/admin/dashboard` - Get dashboard stats (active users, pipeline value, funded volume, pending tasks)
- GET `/api/admin/users` - List all users with search/filter
- PATCH `/api/admin/users/:id` - Update user role
- GET `/api/admin/projects` - List all projects across all users
- GET `/api/admin/projects/:id` - Get project details with admin tasks
- POST `/api/admin/projects/:id/tasks` - Create admin task linked to project
- PATCH `/api/admin/tasks/:id` - Update admin task status
- GET `/api/admin/agreements` - List all agreements across all users
- GET `/api/admin/settings` - Get system settings
- PUT `/api/admin/settings/:key` - Update system setting
- GET `/api/admin/activity` - Get admin activity log

### Admin Back Office System
The application includes a comprehensive admin back office for staff to manage users, view all projects/agreements, and configure system settings.

**Role-Based Access Control:**
- `user` - Standard user, can only see their own data
- `staff` - Can access admin pages but limited write access
- `admin` - Full admin access except user role changes to super_admin
- `super_admin` - Complete system access including role management

**Admin Pages:**
8. Admin Dashboard (/admin) - Overview with key metrics:
   - Active users count
   - Pipeline value (active projects)
   - Funded volume (completed projects)
   - Pending admin tasks
   - Recent admin activity

9. Deals Dashboard (/admin/deals) - Track all cumulative deals:
   - Stats cards: Total Deals, Total Loan Volume, Total Revenue, Total Commission
   - Pipeline by Loan Type tracker showing deal distribution
   - Searchable table of all deals submitted by all users
   - Revenue and commission tracking per deal

10. User Management (/admin/users) - Manage all users:
   - Search by name or email
   - View user details and registration date
   - Change user roles (with appropriate permissions)

10. All Projects (/admin/projects) - View projects across all users:
    - Search by project number, borrower, or address
    - Filter by status (All, Active, Completed)
    - Access project details with admin task management

11. Admin Project Detail (/admin/projects/:id) - Full project view with:
    - All standard project information
    - Admin task management (internal tasks that can link to user milestones)
    - Task sync with user-facing milestones on completion

12. System Settings (/admin/settings) - Configure system-wide settings:
    - Company name
    - Support email
    - Puppeteer quote URL for pricing scraper

**Admin Database Tables:**
- `system_settings` - Key-value store for system configuration
- `admin_tasks` - Internal admin tasks with project linking
- `admin_activity` - Audit log of admin actions

Frontend Auth Components:
- `client/src/hooks/use-auth.tsx` - AuthContext and useAuth hook
- `client/src/pages/login.tsx` - Login page
- `client/src/pages/register.tsx` - Registration page
- `client/src/pages/forgot-password.tsx` - Password reset request
- `client/src/pages/reset-password.tsx` - Password reset completion

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
- `users` - User accounts with authentication fields (email, passwordHash, fullName, passwordResetToken)
- `pricing_requests` - Logs all pricing API requests with status
- `saved_quotes` - Stores saved quotes with customer info, loan data, and commission calculations (user_id foreign key)
- `documents` - E-signature documents with status tracking (draft/sent/in_progress/completed/voided) (user_id foreign key)
  - Fields: sentAt, completedAt, voidedAt, voidedReason for timeline tracking
- `signers` - Document signers with email, token, status, and lastReminderSent
- `document_fields` - Signature/form fields positioned on document pages
- `audit_logs` - Tracks all document actions for compliance

**Projects System Tables:**
- `projects` - Loan closing projects with borrower info, loan details, progress tracking
  - Links to source document via sourceDocumentId
  - Unique project number format: PRJ-YYYY-####
  - borrowerPortalToken for public access
  - externalSyncStatus for LOS integration
- `project_stages` - 9-stage loan closing process per project
  - Stages: documentation, underwriting, appraisal, title_review, insurance, conditions, closing_prep, funding, post_closing
  - status: pending, in_progress, completed, skipped
- `project_tasks` - Individual tasks within stages
  - Types: document_upload, review, approval, collection, scheduling, verification
  - Priorities: critical, high, medium, low
  - visibleToBorrower and borrowerActionRequired flags
- `project_activity` - Timeline of project events
  - visibleToBorrower flag for borrower portal filtering
- `project_documents` - Documents uploaded to projects
- `project_webhooks` - Webhook integration logs for n8n and external LOS

**Auto-Project Creation:**
When an agreement is fully signed, a project is automatically created with:
- 9 stages and all associated tasks from template
- Loan data populated from linked quote (if available)
- Borrower portal enabled by default

Note: `saved_quotes`, `documents`, and `projects` have `user_id` foreign keys with CASCADE delete to ensure data isolation.

## External Dependencies

### Third-Party Services
- **Apify**: Cloud-based web scraping platform running Puppeteer scripts
- **PostgreSQL**: Primary database (requires DATABASE_URL environment variable)

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `APIFY_TOKEN` - API token for Apify client (has fallback in code)
- `JWT_SECRET` - Secret key for JWT token signing (required for production)
- `SESSION_SECRET` - Secret for session management

### Optional Environment Variables (Projects/Webhooks)
- `N8N_WEBHOOK_URL` - Webhook URL for n8n automation
- `EXTERNAL_LOS_WEBHOOK_URL` - Webhook URL for external Loan Origination System
- `WEBHOOK_URLS` - JSON array of additional webhook endpoints
- `BASE_URL` - Base URL for generating borrower portal links

### Key NPM Packages
- `apify-client` - Apify API integration
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `@tanstack/react-query` - Async state management
- `framer-motion` - Animation library
- `connect-pg-simple` - Session storage (available but may not be in use)