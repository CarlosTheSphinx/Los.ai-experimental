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

**Database Schema Highlights**: Manages users, pricing requests, quotes, documents, e-signatures, audit logs, projects (deals), tasks, activities, system settings, partners, loan programs, message threads, commercial loan submissions, and the commercial intake system (funds, fund_documents, fund_knowledge_entries, intake_deals, intake_deal_documents, intake_deal_tasks, intake_document_rules, intake_ai_analysis, intake_deal_status_history, intake_deal_fund_submissions).

**Key Architectural Decisions:**
-   **Multi-Tenancy**: Proper `tenants` table (id=1 is Sphinx Capital). All users have `tenant_id` referencing `tenants.id`. All 12 data tables (`funds`, `projects`, `intake_deals`, `loan_programs`, `partners`, `pricing_requests`, `admin_tasks`, `commercial_form_config`, `intake_document_rules`, `quote_pdf_templates`, `system_settings`, `team_chats`) reference `tenants.id` instead of `users.id`. `getTenantId()` (in `server/utils/tenant.ts`) simply returns `user.tenantId` — no recursive lookups. The auth middleware (`server/auth.ts`) loads `tenantId` onto `req.user` for all authenticated requests.
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
-   **Broker Portal**: Unified authenticated experience with dedicated navigation for quotes, loans, commissions, contacts, and settings. Broker deal detail mirrors the borrower portal layout (stage progress bar, loan overview, document checklist with upload, inline form tasks) with added commission summary card showing broker points and YSP. Legacy token-based `/broker-portal/:token` links redirect to the logged-in app. Brokers see deals matched by their email (`brokerEmail` on projects) with tenant-scoped access control.
-   **Per-Person Invite Links**: Consolidated portal link system using `users.inviteToken` for account setup and access.
-   **Deal Story Recording**: Voice-recorded deal narratives via browser MediaRecorder with OpenAI Whisper transcription. Brokers record audio stories about their deals; recordings are transcribed and submitted with the deal. Transcripts are displayed on admin pipeline detail and fed into the AI analysis pipeline. Component: `DealStoryRecorder.tsx`, endpoint: `POST /api/commercial/deals/:id/transcribe-story`.
-   **Commercial Deal Intake & Fund Matchmaking**: A full intake pipeline for commercial real estate deals with AI-powered screening. Sidebar labels: "Commercial Pipeline" (admin/lender) and "Commercial Deals" (broker). Features include fund management (CRUD with LTV/state/asset-type criteria, extended fields: interest rate range, term range, recourse type, DSCR/credit score minimums, prepayment terms, closing timeline, origination fees), conditional document rules engine (IF/THEN logic for document requirements), broker deal submission form with auto-calculated LTV/DSCR, 3-agent AI pipeline (validator → fund matcher → feedback generator) with rule-based fallback, lender deal review dashboard with AI analysis display, and intake-to-origination transfer. Backend routes in `server/routes/commercialIntake.ts`, AI agents in `server/agents/intakeAgents.ts`. All endpoints tenant-scoped with admin role checks for write operations. Includes a unified Admin Form Builder (`/admin/commercial-form-config`) with 3 tabs: (1) Form Fields — field visibility, required, labels per tenant via `commercial_form_config` table, (2) Document Rules — embedded conditional document requirements editor (IF asset_type/loan_amount/state THEN require docs) using `intake_document_rules` table, (3) AI Analysis — inline configuration of the 3 intake agent prompts, models, and temperature using `agent_configurations` table. Broker form renders dynamically from config. Intake AI pipeline integrated with OrchestrationTracer for real-time debugging via the "Intake AI" tab in the AI Orchestration Debugger.
-   **Fund Knowledge Base & Bulk Upload**: Fund management page (`/admin/commercial/funds`) with searchable/filterable fund list, multi-step bulk import (Excel/CSV upload → column mapping preview → confirm with duplicate handling), and per-fund detail view with 3 tabs: Details (structured fund fields), Documents (upload with AI-powered extraction via pdf-parse + OpenAI into knowledge entries), and Knowledge (auto-generated + manual notes). Fund matcher agent pre-filters candidates by structured criteria and includes knowledge entries in prompt context. Tables: `fund_documents`, `fund_knowledge_entries`. Document extraction runs async in background.
-   **Standardized Loan & Property Types**: The platform uses 7 standardized loan types (Bridge, Construction, DSCR, A&D, Fix & Flip, Long-Term Financing, Land Development) and 11 standardized property types (Residential, Multifamily, Office, Retail, Industrial, Land, Development, Mixed Use, Hospitality, Student Housing, Self-Storage). Constants defined in `shared/loanConstants.ts`. Each fund has a `loanTypes` JSON array field for multi-select loan type matching. The fund matcher pre-filters by `loanTypes` array. Legacy `loanStrategy` field (Bridge/Permanent/Both) retained for backward compatibility. The backfill endpoint (`POST /api/commercial/funds/backfill-strategy`) migrates loanStrategy→loanTypes and normalizes allowedAssetTypes to the standard 11 types.

## External Dependencies

-   **Apify**: Web scraping for external pricing providers.
-   **PostgreSQL**: Primary database.
-   **PandaDoc**: E-signing, status synchronization, and document retrieval.
-   **Resend**: Email sending.
-   **Twilio**: SMS messaging.
-   **Google OAuth 2.0**: Authentication and Google Drive integration.
-   **Google Drive API**: For folder creation and document synchronization.
-   **n8n / External LOS**: Optional webhook integrations.