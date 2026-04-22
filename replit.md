# Loan Pricing White-Label Tool

## Overview
This project is a white-label loan pricing application for Sphinx Capital, designed to automate the entire loan lifecycle from quotes to closing. It aims to boost sales efficiency, integrate external pricing while securing proprietary data, provide robust administration tools, and offer a seamless borrower experience for loan origination and management. The platform features advanced AI capabilities for deal submission and analysis, enhancing decision-making and operational efficiency.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is built on a modern web stack: React 18 with TypeScript for the frontend, Express.js with TypeScript for the backend, and PostgreSQL with Drizzle ORM for data persistence.

**Frontend:**
-   **Technology**: React 18, TypeScript, Wouter, TanStack React Query, Tailwind CSS (shadcn/ui), Framer Motion, React Hook Form with Zod, Vite.
-   **UI/UX**: Adheres to a "Pipeline Design System" with consistent aesthetics and supports various views (List, Board, Compact).
-   **Features**: Loan pricing forms, quote/agreement management (PDF, e-signatures), multi-stage deal management, dedicated borrower and broker portals, admin back office with dashboards, user management, loan program configuration, AI-powered commercial deal submission, and unified AI analysis.

**Backend:**
-   **Technology**: Express.js, TypeScript, Drizzle ORM, RESTful API, Zod for validation.
-   **Core Functionality**: JWT-based authentication with Google OAuth 2.0, multi-tenant architecture, user role differentiation, automated notifications, and external pricing orchestration.
-   **Security**: Implements SOC 2 compliance features including account lockout, immutable audit logging, password management, PII encryption, and secure API Key Management.

**Key Architectural Decisions:**
-   **Multi-Tenancy**: All data tables are tenant-scoped, ensuring data isolation.
-   **Consolidated Role System**: A single `role` field manages permissions and portal access.
-   **AI Integration**: Features an AI Draft Messages Panel, Deal Memory System, "Auto Process Pipeline", Unified AI Analysis Document with approval odds, and an AI Orchestration Debugger. Includes credit policy extraction with chunked parallel processing.
-   **Commercial Deal Intake & Fund Matchmaking**: Full intake pipeline for commercial real estate deals with AI-powered screening, fund management, conditional document rules engine, broker deal submission, and a 3-agent AI pipeline for validation, fund matching, and feedback generation.
-   **Gmail & Google Drive Integration**: Opt-in email synchronization and automated Google Drive folder creation/document sync.
-   **Dynamic Deal Details**: Role-based access controlled deal detail cards.
-   **Enhanced Document Management**: Expandable rows, multi-file uploads, review audit trails, and inline status selection.
-   **Internal E-Signature & Quote PDF Generator**: Manages internal signing and server-side PDF generation for quotes.
-   **Program Creation Wizard & Smart Form Tasks**: Multi-step wizard for defining loan programs and reusable inquiry form templates.
-   **Admin Task Management (TabTasks)**: Unified task view for deal and project tasks.
-   **Borrower & Broker Portals**: Redesigned portals with dashboards, document management, and specific functionalities like commission summaries for brokers. Includes enhanced broker onboarding.
-   **Per-Person Invite Links**: Consolidated system for account setup and access.
-   **Deal Story Recording**: Voice-recorded deal narratives with OpenAI Whisper transcription for AI analysis.
-   **Fund Knowledge Base & Bulk Upload**: Fund management with searchable lists, bulk import, and AI-powered document extraction into knowledge entries.
-   **Support Tickets**: Full broker support system with help questions, bug reports, and feature requests. Includes SMS bug alerts + 9am ET daily digest, status state machine with audit history, NY-business-hours SLA tracking + breach badges + auto-close after 14 days inactivity, broker reopen-by-reply within 14 days, bot escalation handoff (Lendry Assistant transcript carried into a ticket), admin internal notes (hidden from brokers, no SLA impact), reply email body inlined for brokers, and a broker context sidebar showing related tickets.
-   **Standardized Loan & Property Types**: Uses 7 standardized loan types and 11 property types with a flexible matching system for funds.

## External Dependencies

-   **Apify**: Web scraping for external pricing providers.
-   **PostgreSQL**: Primary database.
-   **PandaDoc**: E-signing, status synchronization, and document retrieval.
-   **Resend**: Email sending.
-   **Twilio**: SMS messaging.
-   **Google OAuth 2.0**: Authentication and Google Drive integration.
-   **Google Drive API**: For folder creation and document synchronization.
-   **n8n / External LOS**: Optional webhook integrations.