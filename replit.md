# Loan Pricing White-Label Tool

## Overview
This project is a white-label loan pricing application designed for Sphinx Capital. Its core purpose is to automate and streamline the entire loan lifecycle, from initial quotes to final closing. The platform aims to enhance sales efficiency, integrate with external pricing providers while securing proprietary data, offer robust internal administration tools, and provide a seamless borrower experience for loan origination and management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is built using a modern web stack: React 18 with TypeScript for the frontend, Express.js with TypeScript for the backend, and PostgreSQL with Drizzle ORM for data persistence.

**Frontend:**
-   **Technology Stack**: React 18, TypeScript, Wouter, TanStack React Query, Tailwind CSS (shadcn/ui), Framer Motion, React Hook Form with Zod, Vite.
-   **UI/UX**: Adheres to a "Pipeline Design System" for consistent aesthetics, supporting List, Board (Kanban), and Compact views. Typography uses Cormorant Garamond, Playfair Display, and DM Sans.
-   **Key Features**: Comprehensive loan pricing forms, quote/agreement management (PDF generation, e-signatures), multi-stage deal/loan management, dedicated borrower and broker portals, and an admin back office with dashboards, user management, and loan program configuration. Includes AI-powered Commercial Deal Submission and a Unified AI Analysis Document for deal reviews.

**Backend:**
-   **Technology Stack**: Express.js, TypeScript, Drizzle ORM, RESTful API, Zod for validation.
-   **Core Functionality**: JWT-based authentication with Google OAuth 2.0, multi-tenant architecture, user role differentiation, automated notifications, and orchestration of external pricing requests.
-   **Security**: Implements SOC 2 compliance features including account lockout, immutable audit logging, password management, JWT invalidation, PII encryption, and Content-Security-Policy. Includes SOC 2-compliant API Key Management and Webhook System.

**Database Schema Highlights**: Manages users, pricing requests, quotes, documents, e-signatures, audit logs, projects (deals), tasks, activities, system settings, partners, loan programs, message threads, and commercial loan submissions.

**Key Architectural Decisions:**
-   **Multi-Tenancy**: Ensures full data isolation using `tenantId`.
-   **Consolidated Role System**: A single `role` field drives all permission checks, navigation routing, and portal access (`super_admin`, `lender`, `processor`, `broker`, `borrower`).
-   **Google Drive Integration**: Automates folder creation and document synchronization per project.
-   **Multi-Property Support**: Handles multiple properties per loan with auto-calculated LTV and DSCR.
-   **Program-to-Deal Sync**: Non-destructive propagation of loan program template changes to existing deals, including task auto-creation with dynamic due dates.
-   **Ready for Review Indicators**: Documents awaiting review are highlighted across the platform.
-   **Unified Checklist System**: Provides a single source of truth for checklists with role-based filtering.
-   **AI Integration**: Features an AI Draft Messages Panel, a Deal Memory System, an "Auto Process Pipeline", and a Unified AI Analysis Document with prominent Approval Odds, inline lender decisions, and a chronological timeline of analysis entries. Includes an AI Orchestration Debugger for super_admins with real-time agent tracing, prompt replay, and credit extraction streaming. Credit policy extraction uses a centralized 16-category system prompt and supports chunked parallel processing for large documents with deduplication and real-time progress streaming.
-   **Gmail Integration**: Opt-in email integration for syncing threads, messages, and attachments.
-   **Dynamic Deal Details**: Deal detail cards dynamically render based on configuration with role-based access control.
-   **Enhanced Document Management**: Expandable document rows with multi-file uploads, review audit trails, and inline status selection.
-   **Internal E-Signature Flow**: Manages internal signing for quotes with PDF generation.
-   **Quote PDF Generator**: Server-side PDF generation for customizable summary and LOI templates.
-   **Program Creation Wizard**: A multi-step wizard for defining loan programs, credit policies, forms, stages, tasks, AI rules, and pricing.
-   **Smart Form Tasks**: Reusable inquiry form templates linked to program tasks for borrower data submission.
-   **Admin Task Management (TabTasks)**: Unified task view in deal detail, supporting creation and editing of both deal and project tasks.
-   **Borrower Portal**: Redesigned portal with a "My Loans" dashboard, read-only deal details, document upload/replace, and borrower-visible tasks. Includes a persistent document vault and profile management.
-   **Broker Portal**: Upgraded authenticated experience with dedicated navigation for quotes, loans, commissions, contacts, and settings.
-   **Per-Person Invite Links**: Consolidated portal link system using `users.inviteToken` for account setup and access.

## External Dependencies

-   **Apify**: Web scraping for external pricing providers.
-   **PostgreSQL**: Primary database.
-   **PandaDoc**: E-signing, status synchronization, and document retrieval.
-   **Resend**: Email sending.
-   **Twilio**: SMS messaging.
-   **Google OAuth 2.0**: Authentication and Google Drive integration.
-   **Google Drive API**: For folder creation and document synchronization.
-   **n8n / External LOS**: Optional webhook integrations.