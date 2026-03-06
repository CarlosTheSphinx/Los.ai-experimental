# Loan Pricing White-Label Tool

## Overview
This project is a white-label loan pricing application for Sphinx Capital, designed to automate loan pricing, enhance sales efficiency, and manage quotes, agreements, and the loan closing lifecycle. It integrates external pricing providers while protecting proprietary information, offering a robust platform for internal administration and a seamless borrower experience to improve loan origination and management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application uses a modern web stack: React 18 with TypeScript for the frontend, Express.js with TypeScript for the backend, and PostgreSQL with Drizzle ORM for data persistence.

**Frontend:**
-   **Technology Stack**: React 18, TypeScript, Wouter, TanStack React Query, Tailwind CSS (shadcn/ui), Framer Motion, React Hook Form with Zod, Vite.
-   **Key Features**: Loan pricing forms (DSCR, Fix and Flip/Ground Up Construction), quote/agreement management (PDF, e-signatures), multi-stage deal/loan management, borrower portal, borrower quote flow, and an admin back office with dashboards, user management, and loan program configuration. Includes onboarding wizards, a customizable quote form builder, and a Commercial Deal Submission Module with AI-powered pre-screener.
-   **UI/UX**: Utilizes a "Pipeline Design System" for consistent UI elements, typography, and component styling across admin pages. Supports List, Board (Kanban), and Compact views for the pipeline.

**Backend:**
-   **Technology Stack**: Express.js, TypeScript, Drizzle ORM, RESTful API, Zod for validation.
-   **Core Functionality**: JWT-based authentication with httpOnly cookies and Google OAuth 2.0, multi-tenant architecture, user type differentiation (Brokers/Borrowers), deal-linked messaging, automated notifications, and orchestration of external pricing requests.
-   **Security (SOC 2 Compliance Layer)**: Features account lockout, immutable audit logging, password expiry/complexity, bcrypt hashing, JWT token invalidation, PII encryption, and Content-Security-Policy.
-   **API Key Management**: SOC 2-compliant system with hashed storage, scope-based access control, rate limiting, and audit trails.
-   **Webhook System**: SOC 2-compliant infrastructure with HMAC-SHA256 verification, SSRF protection, exponential backoff retry, and timing-safe signature comparison.

**Database Schema Highlights**: Manages users, pricing requests, quotes, documents, e-signatures, audit logs, projects (deals), tasks, activities, system settings, admin tasks, partners, loan programs, message threads, onboarding progress, loan digest configurations, and commercial loan submissions.

**Key Architectural Decisions:**
-   **Multi-Tenancy**: Full data isolation using `tenantId` columns and robust resolution logic.
-   **Google Drive Integration**: Automated folder creation and document synchronization per project.
-   **Multi-Property Support**: Handles multiple properties per loan with CRUD operations.
-   **Program-to-Deal Sync**: Non-destructive propagation of loan program template changes to existing deals.
-   **Unified Checklist System**: Single source of truth for checklists across user roles with role-based filtering.
-   **AI Integration**: AI Draft Messages Panel for AI-generated communication drafts and a Deal Memory System for persistent AI context. An "Auto Process Pipeline" triggers AI-powered document and communication generation.
-   **Gmail Integration**: Opt-in email integration for syncing threads, messages, and attachments, with in-app inbox and notifications.
-   **Dynamic Deal Details**: Deal detail cards (Loan, Property, Borrower) on the Overview tab dynamically render based on program's `quoteFormFields` configuration, with role-based access control for critical fields.
-   **Enhanced Document Management**: 5-step status lifecycle (Pending to Synced to Drive), per-document AI review triggers (Automatic, Timed, Manual modes), and explicit "Push to Drive" functionality.
-   **People Tab**: Manages Borrower, Broker, Team Members, and Third Parties with full CRUD.
-   **Enhanced Deal Controls**: Features processor assignment, dynamic status/stage dropdowns (program-specific or default), and confirmation for loan program changes.
-   **Notification System**: Configurable notification preferences per tenant with fallback to global defaults, covering various app activities.
-   **Program Creation Wizard**: Multi-step wizard for defining loan programs, including template selection, credit policies, quote forms, stages, tasks, AI rules, and pricing.
-   **Smart Form Tasks**: Reusable inquiry form templates (`inquiry_form_templates`) that admins attach to program task templates via the wizard. When a deal's stage activates, borrowers see dynamic forms in their portal (LoanChecklist), submit data which auto-creates Third Party contacts, auto-completes the task, and notifies admins. Managed in Settings > Inquiry Forms tab. Submissions stored in `task_form_submissions`. Auto-email via Resend on stage move.
-   **Site Modes**: Supports `landing` mode for a "Coming Soon" page with email collection and `full` mode for normal application access, controlled by feature flags.

## External Dependencies

-   **Apify**: Web scraping for external pricing providers.
-   **PostgreSQL**: Primary database.
-   **PandaDoc**: E-signing, status synchronization, and document retrieval.
-   **Resend**: Email sending.
-   **Twilio**: SMS messaging.
-   **Google OAuth 2.0**: Authentication and Google Drive integration.
-   **Google Drive API**: For folder creation and document synchronization.
-   **n8n / External LOS**: Optional webhook integrations.