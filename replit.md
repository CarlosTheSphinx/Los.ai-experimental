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
    - **Admin Back Office**: Provides dashboards, user management, project oversight, system settings, partner management, and loan program configuration with role-based access control (`user`, `staff`, `admin`, `super_admin`).
    - **Commercial Deal Submission Module**: A multi-step wizard for brokers to submit commercial loan applications for admin review, with features for document uploads and status tracking.

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

## External Dependencies

- **Apify**: Cloud-based web scraping platform for integrating with external pricing providers.
- **PostgreSQL**: The primary relational database for all application data.
- **PandaDoc**: Optional e-signing service for agreement management.
- **Resend**: Used for sending emails (e.g., loan digests, partner broadcasts).
- **Twilio**: Used for sending SMS messages (e.g., loan digests, partner broadcasts).
- **Google OAuth 2.0**: For user authentication and Google Drive integration.
- **Google Drive API**: For automatic project folder creation and document sync (via googleapis npm package).
- **n8n / External LOS**: Optional webhook integrations for automation and Loan Origination Systems.