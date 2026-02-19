# Loan Pricing White-Label Tool

## Overview
This project is a white-label loan pricing application for Sphinx Capital, designed to automate and streamline the loan pricing process, improve sales efficiency, and provide comprehensive tools for managing quotes, agreements, and the entire loan closing lifecycle. It automates interaction with external pricing providers while keeping proprietary sources confidential. The application aims to provide a robust platform for both internal administrative use and a seamless borrower experience, ultimately enhancing loan origination and management capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is built on a modern web stack using React 18 with TypeScript for the frontend, Express.js with TypeScript for the backend, and PostgreSQL with Drizzle ORM for data persistence.

**Frontend:**
-   **Technology Stack**: React 18, TypeScript, Wouter, TanStack React Query, Tailwind CSS (shadcn/ui New York style), Framer Motion, React Hook Form with Zod, Vite.
-   **Core Features**:
    -   **Loan Pricing Forms**: Supports DSCR and Fix and Flip/Ground Up Construction loan types with dynamic adjusters.
    -   **Quote & Agreement Management**: Tools for saving quotes, managing agreements, including PDF viewing, e-signatures, and document timelines.
    -   **Deal/Loan Management**: Multi-stage loan closing process tracking with task checklists, activity timelines, and document management.
    -   **Borrower Portal**: Token-based public portal for borrowers to view loan progress, manage documents, and see activity timelines.
    -   **Borrower Quote Flow**: Allows borrowers to generate and accept loan quotes, which automatically create deals in the admin dashboard.
    -   **Admin Back Office**: Provides dashboards, user management, deal oversight, system settings, partner management, and loan program configuration with role-based access control.
    -   **Admin Onboarding / Getting Started**: 5-step guided setup wizard for new lenders covering: (1) Company Profile (name, support email, sender name via tenant_branding config), (2) Team Setup (view/add team members with roles), (3) Integrations (Gmail, Google Drive folder ID, external service status grid), (4) Loan Programs walkthrough, (5) Communications & AI configuration. New lenders are redirected here until they complete setup. Also includes Training Materials and User Status management tabs.
    -   **Loan Program Creation Wizard**: 8-step wizard for creating loan programs: (1) Credit Policy, (2) Program Details, (3) Quote Form Builder, (4) Stages, (5) Documents, (6) Tasks, (7) AI Rules, (8) Review & Create. The Quote Form Builder (Step 3) configures which fields borrowers/brokers see when requesting quotes for the program, with drag-to-reorder, field type selection (text/number/currency/email/phone/percentage/select/yes-no), visible/required toggles, conditional logic (show field based on another field's value), and default contact fields (first name, last name, email, phone, address) that are always included. QuoteFormField data model: `{ fieldKey, label, fieldType, required, visible, isDefault, options?, conditionalOn?, conditionalValue? }`.
    -   **Commercial Deal Submission Module**: An independent system for commercial loan submissions, featuring:
        -   **Pre-Screener**: AI-powered quick deal check.
        -   **Multi-Step Submission Form**: Comprehensive data collection for commercial deals.
        -   **Broker Dashboard**: Overview of broker's submissions.
        -   **Admin Configuration**: Settings for pre-screener, custom fields, document requirements, AI review rules, and notifications.
        -   **Admin Deal Review Queue & Detail**: Tools for reviewing, approving, or declining commercial submissions with AI insights.
        -   **AI Review Engine**: OpenAI-powered evaluation of deals against configurable rules.
        -   **Automated Notifications**: Email alerts via Resend for various submission statuses.

**Backend:**
-   **Technology Stack**: Express.js, TypeScript, Drizzle ORM, RESTful API, Zod for validation.
-   **Authentication**: JWT in httpOnly cookies, bcrypt for hashing, multi-tenant authentication, Google OAuth 2.0 support.
-   **User Types & Onboarding**: Differentiates between Brokers (full platform access after onboarding flow) and Borrowers (simplified dashboard).
-   **Messaging System**: Deal-linked communication between users and admins.
-   **Notification Systems**: Automated loan digest notifications (Email/SMS) to borrowers and partners; admin broadcast system for personalized mass communications.
-   **Data Flow**: Orchestrates frontend input, external pricing requests via Apify, and interest rate retrieval.

**Database Schema Highlights**:
Manages users, pricing requests, quotes, documents, e-signatures, audit logs, projects, tasks, activities, system settings, admin tasks, partners, loan programs, message threads, onboarding progress, loan digest configurations, and commercial loan submissions.

**Google Drive Integration**:
Automates Google Drive folder creation and document synchronization for projects, utilizing the super_admin's OAuth tokens.

**Multi-Property Support**:
Enables handling of multiple properties per loan (portfolio/blanket loans) with dedicated database tables and full CRUD operations on the frontend. Property addresses are used for document linking and AI review reference.

**Program-to-Deal Sync**:
Automatically propagates changes from loan program templates (workflow, documents, tasks) to all associated existing deals non-destructively, maintaining template references and remapping IDs as needed.

**Unified Checklist System**:
A "single source of truth" checklist system where admin, broker, and borrower views display the same underlying data with role-based filtering. Key architectural decisions:
-   Extended existing `deal_documents` and `project_tasks` tables with `assignedTo` and `visibility` fields rather than creating a separate unified table, to minimize migration risk and preserve PandaDoc/Google Drive integrations.
-   Three checklist API endpoints (`/api/projects/:id/checklist`, `/api/portal/:token/checklist`, `/api/admin/deals/:dealId/checklist`) all query the same underlying tables with role-appropriate visibility filtering.
-   Shared `LoanChecklist.tsx` component used across borrower portal, broker deal page, and admin deal detail with configurable mode (`admin`/`broker`/`borrower`), upload/review callbacks, and automatic polling (15s borrower/broker, 10s admin).
-   Documents use `assignedTo` (borrower/broker/admin) and `visibility` (all/borrower/broker/admin) for role-based filtering. Tasks use existing `visibleToBorrower` field mapped from program template `visibility` settings.
-   When a borrower uploads a document, admin sees it immediately via polling; when admin approves/rejects, borrower/broker see it immediately.

**Multi-Tenancy (Loan Programs & Credit Policies)**:
Each lender (admin user) can only see and manage their own loan programs and credit policies. The `loan_programs` and `credit_policies` tables have a `created_by` column referencing the user who created them. All API endpoints filter data by the logged-in user's ID, with `super_admin` users having visibility into all records across all tenants. Ownership checks are enforced on GET, PUT, and DELETE operations.

**Deal Memory System**:
A persistent right sidebar on the deal detail page that serves as the AI communication agent's historical context. Key components:
-   **Database Tables**: `deal_memory_entries` stores timeline events (document received/approved/rejected, stage changes, digests sent, notes, field changes). `deal_notes` stores admin notes with @mention support and AI instructions.
-   **DealMemoryPanel Component**: Tabbed interface (Timeline + Notes) accessible via "Deal Memory" toggle button on deal detail page. Notes support @mentions with autocomplete, AI instructions (prefix with `/ai`), and pinned notes.
-   **Auto-Seeding**: When first opened, the panel auto-populates memory from existing deal documents, activities, and digest history.
-   **AI Context Injection**: The communication agent orchestrator (`server/agents/orchestrator.ts`) injects deal memory entries, admin notes, AI instructions, past agent communications, and past digest history into the AI context, preventing repeated communications.
-   **Replaces**: The old "Deal Story" tab has been removed in favor of this more comprehensive Deal Memory sidebar.

**Gmail Integration**:
Opt-in email integration allowing lenders to connect their Gmail account via separate OAuth flow (gmail.readonly + gmail.modify scopes). Key components:
-   **Database Tables**: `email_accounts` (OAuth tokens, sync status), `email_threads` (synced threads with subject/snippet/participants), `email_messages` (individual messages with body/attachments), `email_thread_deal_links` (many-to-many thread-to-deal linking).
-   **Gmail Service** (`server/services/gmail.ts`): OAuth flow, token refresh, email sync (up to 50 threads), attachment download, new email notification checks.
-   **Email Routes** (`server/routes/email.ts`): 13 endpoints for account management, thread listing/detail, deal linking/unlinking, sync, attachment download, deal-specific threads, and deal suggestion.
-   **Email Inbox Page** (`client/src/pages/admin/email-inbox.tsx`): Full inbox with thread list sidebar (search, filter by linked/unlinked), thread detail with messages, deal linking dialog with AI-suggested deals.
-   **Messages Integration**: In-App/Email tab toggle in messages sidebar showing deal-linked email threads with inline detail viewing.
-   **Deal Detail Integration**: LinkedEmailsSection component in Communications tab showing email threads linked to that deal.
-   **Settings Integration**: EmailIntegrationConfig component for Gmail connect/disconnect and sync controls.
-   **Notifications**: `new_email` notification type triggers when new emails arrive on deal-linked threads.

**Terminology Note**:
The database still uses `projects` as the table name, but the entire UI refers to these entities as "Deals" or "Loans" (used interchangeably). Frontend routes use `/deals/*` and `/api/deals/*` with URL rewriting middleware on the backend mapping to the underlying `/api/projects/*` handlers. Internal TypeScript variable names may still reference `project` but all user-facing text says "Deal" or "Loan". User-facing identifiers use `DEAL-{id}` format (e.g., `DEAL-27`) instead of the old `PRJ-YYYY-NNNN` project number format. All views (admin, broker, borrower portal) now display consistent deal identifiers, loan program names, and numbered-stage progress with document/task counts.

## External Dependencies

-   **Apify**: Cloud-based web scraping for external pricing providers.
-   **PostgreSQL**: Primary relational database.
-   **PandaDoc**: E-signing service for agreement management, including a comprehensive status synchronization system. Critical coordinate conversion (72 DPI to 96 DPI) is handled. Signed documents automatically return to the system: webhook handler and polling backstop detect completed documents, download the signed PDF, upload to object storage, and auto-insert into the deal's stage 1 document section with activity logging and optional Drive sync. The `esignEnvelopes` table tracks `projectId` to link documents to deals.
-   **Resend**: Email sending service.
-   **Twilio**: SMS messaging service.
-   **Google OAuth 2.0**: For user authentication and Google Drive integration.
-   **Google Drive API**: For automatic project folder creation and document synchronization.
-   **n8n / External LOS**: Optional webhook integrations for automation and Loan Origination Systems.