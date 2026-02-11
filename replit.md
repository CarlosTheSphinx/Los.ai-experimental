# Loan Pricing White-Label Tool

## Overview

This project is a white-label loan pricing application for Sphinx Capital, designed to streamline the loan pricing process, enhance sales efficiency, and provide comprehensive tools for managing quotes, agreements, and the entire loan closing lifecycle. It automates submitting loan information to an external pricing provider using Apify's Puppeteer scraper, keeping proprietary pricing sources confidential. The application includes a React frontend for data entry, an Express backend for orchestrating pricing requests, and a PostgreSQL database for persisting essential data. It also features a borrower-facing portal and robust admin capabilities to manage the loan closing process and user interactions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application uses a modern web stack: React 18 with TypeScript for the frontend, Express.js with TypeScript for the backend, and PostgreSQL with Drizzle ORM for data persistence.

**Frontend:**
- **Technology**: React 18 with TypeScript, Wouter for routing, TanStack React Query for state management, Tailwind CSS with shadcn/ui (New York style) for styling, Framer Motion for animations, and React Hook Form with Zod for form handling. Vite is used as the build tool.
- **Key Features**:
    - **Loan Pricing Forms**: Supports DSCR and Fix and Flip / Ground Up Construction loan types with dynamic rate adjusters, disqualifiers, and leverage caps.
    - **Quote Management**: Features for saving and managing pricing quotes.
    - **Agreement Management**: Comprehensive tools for managing agreements, including PDF viewing, e-signatures, and document timelines.
    - **Project Management**: Tracks a 9-stage loan closing process with task checklists, activity timelines, and document management.
    - **Borrower Portal**: A public, token-based portal for borrowers to view loan progress.
    - **Borrower Project Detail**: Mirrors the admin deal detail page — shows loan stages pipeline, deal document checklist with upload capability (status: pending/uploaded/approved/rejected with rejection reasons), activity timeline (filtered to borrower-visible items), read-only task view, and deal-linked messaging. Admin-only features (Drive links, LOS push, digest config, borrower link copy) are hidden. Digests are not optional for borrowers — they receive communications automatically per deal.
    - **Borrower Quote Flow**: Borrowers can get their own loan pricing quotes (DSCR or Fix & Flip) via `/borrower-quote`, with commission/revenue hidden. Saved quotes appear at `/borrower-quotes` showing only total estimated fees. Accepting a quote auto-creates a project on the admin dashboard with full pipeline. Duplicate acceptance is prevented via `sourceDocumentId` check.
    - **Admin Back Office**: Provides dashboards, user management, project oversight, system settings, partner management, and loan program configuration with role-based access control (`user`, `staff`, `admin`, `super_admin`).
    - **Commercial Deal Submission Module**: A comprehensive commercial loan submission system operating independently from the residential/bridge pipeline. Features include:
      - **Pre-Screener** (`/commercial/pre-screen`): 5-question quick deal check with AI-powered analysis (proceed/decline/borderline outcomes) before full submission.
      - **9-Step Submission Form** (`/commercial-submission/new`): Submitter Info, Deal Terms, Property Details & Condition, Financial Details (unit mix, tenant info), Construction Budget (conditional), Sponsor & Entity (legal/credit history), Existing Debt, Documents, Review & Submit. ~60 form fields covering all aspects of commercial deals.
      - **Broker Dashboard** (`/commercial/dashboard`): Lists broker's own submissions with status filtering and AI decision badges.
      - **Admin Commercial Config** (`/admin/commercial/config`): 5-tab config page for Pre-Screener criteria, Custom Fields, Document Requirements, AI Review Rules, and Notification settings.
      - **Admin Deal Review Queue** (`/admin/commercial-submissions`): Comprehensive review table with search, status filters, bulk actions (approve/decline), AI score display, and re-run AI capability.
      - **Admin Deal Detail** (`/admin/commercial/submissions/:id`): Full deal view with tabs for Deal Overview, AI Review results (score, risk factors, strengths), Documents, Admin Notes, and Activity timeline.
      - **AI Review Engine** (`server/services/commercialAiReview.ts`): Automatic OpenAI-powered review triggered on submission, evaluating deals against configurable rules and returning decision, score (0-100), risk factors, and strengths.
      - **Email Notifications** (`server/services/commercialNotifications.ts`): Automated emails via Resend for submission received, approved, declined, info needed, and admin alerts. Configurable per notification type via admin settings.
      - **Submission Expiration**: Auto-expires submissions after 30 days with hourly background checks. No pricing estimates shown until underwriting approval.

**Backend:**
- **Technology**: Express.js with TypeScript, Drizzle ORM for PostgreSQL, RESTful API endpoints, and Zod schemas for validation (shared with frontend).
- **Authentication**: JWT tokens in httpOnly cookies, bcrypt for password hashing, and multi-tenant authentication with data isolation. Supports Google OAuth 2.0.
- **User Types & Onboarding**: Differentiates between Brokers (full platform access after onboarding) and Borrowers (simplified dashboard). Brokers undergo a mandatory onboarding flow involving partnership agreement signing and training completion, managed by admins.
- **Messaging System**: Deal-linked messaging for communication between users and admins, with automatic notifications and role-based access.
- **Loan Digest Notification System**: Automated, configurable notifications (Email/SMS) to borrowers and partners about loan progress, including document needs, updates, and lender notes.
- **Partner Broadcast System**: Allows admins to send personalized mass emails and SMS to partners, with delivery tracking and an SMS inbox for replies.
- **Data Flow**: Frontend input is validated, backend triggers an Apify actor for external pricing, and the resulting interest rate is returned.

**Database Schema Highlights**:
Key tables manage users, pricing requests, quotes, documents, e-signatures, audit logs, projects, project tasks and activity, system settings, admin tasks, partners, loan programs, message threads, onboarding progress, loan digest configurations, and commercial loan submissions.

## Google Drive Integration

The application integrates with Google Drive to automatically organize project documents:
- **Auto-folder creation**: When a new project is created, a Google Drive folder is automatically created (non-blocking).
- **Document sync**: When documents are uploaded to a project, they are automatically synced to the project's Drive folder.
- **OAuth-based**: Uses the super_admin's Google OAuth tokens (with `drive.file` scope) to access Drive API. No service account needed.
- **Status tracking**: `driveSyncStatus` on projects and `driveUploadStatus` on project documents track sync state (NOT_ENABLED, PENDING, OK, ERROR).
- **Retry support**: Failed Drive operations can be retried via admin endpoints.
- **Configuration**: Admin must set a parent folder ID in System Settings (Admin > Settings > Google Drive Integration).
- **Setup requirements**: Enable Google Drive API in Google Cloud Console, add `drive.file` scope to OAuth consent screen, super admin must log in with Google.
- **Service module**: `server/services/googleDrive.ts` handles all Drive API operations.
- **Key API endpoints**: 
  - `POST /api/projects/:id/documents/upload-url` - Get presigned upload URL
  - `POST /api/projects/:id/documents/upload-complete` - Complete upload + trigger Drive sync
  - `GET /api/projects/:id/documents` - List project documents
  - `POST /api/projects/:id/drive/retry` - Retry Drive folder creation (admin only)
  - `POST /api/documents/:id/drive/retry` - Retry Drive document upload (admin only)
  - `POST /api/admin/deals/:dealId/documents/:docId/drive/retry` - Retry Drive upload for deal documents (admin only)
  - `GET /api/admin/drive/status` - Check Drive integration status (admin only)
- **Auto-sync**: When documents are uploaded to a deal via admin panel, they automatically sync to the deal's Google Drive folder (non-blocking). The `syncDealDocumentToDrive` function in `server/services/googleDrive.ts` handles this.
- **Token refresh**: The `getDriveClient` function now automatically refreshes expired Google OAuth tokens and persists them to the database.
- **Drive folder targeting**: `syncDealDocumentToDrive` checks if `dealId` is a project first (using `ensureProjectFolder`) before falling back to `ensureDealFolder`, ensuring documents go to the correct project's folder.

## Multi-Property Support

Loans can have multiple properties (portfolio/blanket loans):
- **`deal_properties` table**: Stores multiple addresses per deal/project with address, city, state, zip, propertyType, estimatedValue, isPrimary, and sortOrder.
- **Auto-creation**: When a quote is accepted or a project is created manually with a property address, a primary `dealProperty` record is automatically created. Additional properties from `loanData.additionalProperties` are also created.
- **Deal detail page**: Properties section with full CRUD (add/edit/delete), "Import from deal address" fallback for existing deals.
- **Borrower quote form**: "Add Another Property" button allows adding multiple property addresses when creating a quote.
- **AI Document Review**: All deal property addresses are passed as reference data. Address-matching rules check against ALL properties — a match to any one constitutes a pass.
- **Document linking**: `dealDocuments.dealPropertyId` optionally links a document to a specific property.
- **API endpoints**:
  - `GET /api/admin/deals/:dealId/properties` - List properties
  - `POST /api/admin/deals/:dealId/properties` - Add property
  - `PATCH /api/admin/deals/:dealId/properties/:propId` - Update property
  - `DELETE /api/admin/deals/:dealId/properties/:propId` - Delete property

## Program-to-Project Sync

When a loan program's workflow is edited (documents moved between stages, tasks added/removed/updated, workflow steps changed), those changes automatically propagate to all existing projects assigned to that program:
- **Template reference tracking**: `projectStages.programStepId`, `projectTasks.programTaskTemplateId`, and `dealDocuments.programDocumentTemplateId` link project-level items back to program templates.
- **Non-destructive sync**: `syncProgramToProjects()` in `server/services/projectPipeline.ts` performs a merge — updates existing items, creates new ones, marks removed templates as skipped/not_applicable. Completed tasks and uploaded documents are never deleted.
- **Step ID remapping**: When workflow steps are saved (delete/recreate), old step IDs are remapped to new IDs on templates and project stages to maintain stage assignments.
- **Auto-trigger**: Sync runs in the background after every program template change (add/update/delete/batch-step for documents, tasks, and workflow steps).

## External Dependencies

- **Apify**: Cloud-based web scraping platform for integrating with external pricing providers.
- **PostgreSQL**: The primary relational database for all application data.
- **PandaDoc**: E-signing service for agreement management. All document sending goes through PandaDoc exclusively. **Critical: PandaDoc uses 96 DPI coordinates internally while PDFs use 72 DPI, so all field coordinates (x, y, width, height) must be multiplied by 4/3 (96/72) when injecting via the API.** Prefilled text values are burned directly into the PDF using pdf-lib (permanent, non-editable), while interactive signer fields (signature, date, initials) are injected as PandaDoc fields. Calibration endpoint at `/api/pandadoc/debug-field-placement` available for testing.
- **Resend**: Used for sending emails (e.g., loan digests, partner broadcasts).
- **Twilio**: Used for sending SMS messages (e.g., loan digests, partner broadcasts).
- **Google OAuth 2.0**: For user authentication and Google Drive integration.
- **Google Drive API**: For automatic project folder creation and document sync (via googleapis npm package).
- **n8n / External LOS**: Optional webhook integrations for automation and Loan Origination Systems.