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

**Terminology Note**:
The database still uses `projects` as the table name, but the entire UI refers to these entities as "Deals" or "Loans" (used interchangeably). Frontend routes use `/deals/*` and `/api/deals/*` with URL rewriting middleware on the backend mapping to the underlying `/api/projects/*` handlers. Internal TypeScript variable names may still reference `project` but all user-facing text says "Deal" or "Loan".

## External Dependencies

-   **Apify**: Cloud-based web scraping for external pricing providers.
-   **PostgreSQL**: Primary relational database.
-   **PandaDoc**: E-signing service for agreement management, including a comprehensive status synchronization system. Critical coordinate conversion (72 DPI to 96 DPI) is handled.
-   **Resend**: Email sending service.
-   **Twilio**: SMS messaging service.
-   **Google OAuth 2.0**: For user authentication and Google Drive integration.
-   **Google Drive API**: For automatic project folder creation and document synchronization.
-   **n8n / External LOS**: Optional webhook integrations for automation and Loan Origination Systems.