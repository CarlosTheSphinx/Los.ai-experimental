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
-   **Typography**: 3 typefaces — Cormorant Garamond (`font-display`) for page titles/headings, Playfair Display (`font-sans`) for public page body text, DM Sans (`font-ui`) at 400 weight for admin sidebar nav and admin page body content (tables, labels, descriptions). Logo "LENDRY AI" uses wide letter-spacing with Cormorant Garamond. Tagline "Lending Intelligence" below logo in sidebar.
-   **Sidebar Nav Icons**: Bloomberg/Linear style — 14px Lucide icons wrapped in fixed 14×14 `<span>` containers via shared `NavIcon` component in `AppLayout.tsx`. Default color `rgba(255,255,255,0.3)` (muted), active color `#C9A84C` (gold). Wrapper prevents shadcn sidebar `[&>svg]` CSS from overriding size/color. The `[&>svg]:size-4` was removed from `sidebarMenuButtonVariants` in `sidebar.tsx`.

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
-   **AI Integration**: AI Draft Messages Panel for AI-generated communication drafts and a Deal Memory System for persistent AI context. An "Auto Process Pipeline" triggers AI-powered document and communication generation. The "AI Reviews" tab on the deal detail page shows document review results (with approve/reject actions), AI-generated draft messages, risk flags, and recommendations — auto-navigates to this tab when the pipeline completes.
-   **Gmail Integration**: Opt-in email integration for syncing threads, messages, and attachments, with in-app inbox and notifications.
-   **Dynamic Deal Details**: Deal detail cards (Loan, Property, Borrower) on the Overview tab dynamically render based on program's `quoteFormFields` configuration, with role-based access control for critical fields.
-   **Enhanced Document Management**: 5-step status lifecycle (Pending to Synced to Drive), per-document AI review triggers (Automatic, Timed, Manual modes), and explicit "Push to Drive" functionality.
-   **People Tab**: Manages Borrower, Broker, Team Members, and Third Parties with full CRUD.
-   **Enhanced Deal Controls**: Features processor assignment, dynamic status/stage dropdowns (program-specific or default), and confirmation for loan program changes.
-   **Notification System**: Configurable notification preferences per tenant with fallback to global defaults, covering various app activities.
-   **Program Creation Wizard**: Multi-step wizard for defining loan programs, including template selection, credit policies, quote forms, stages, tasks, AI rules, and pricing. Credit policy View Policy dialog supports inline editing of rules. Pricing step supports "External API" mode with configurable scraper URL, text input mappings (element IDs to field keys), and dropdown definitions with editable options. "Load NQX Defaults" pre-seeds the NQX pricer configuration. Config stored in `loanPrograms.externalPricingConfig` (jsonb) and `loanPrograms.pricingMode` columns.
-   **Dynamic Quote Form**: `DynamicQuoteForm` component (`client/src/components/DynamicQuoteForm.tsx`) renders quote forms dynamically based on a program's `quoteFormFields` JSON configuration. Supports all field types (text, number, currency, email, phone, select, yes_no, percentage, date, radio, address), conditional visibility, display group sections, and Zod-based required field validation. Falls back to hardcoded `LoanForm`/`RTLLoanForm` when `quoteFormFields` is null.
-   **Smart Form Tasks**: Reusable inquiry form templates (`inquiry_form_templates`) that admins attach to program task templates via the wizard. When a deal's stage activates, borrowers see dynamic forms in their portal (LoanChecklist), submit data which auto-creates Third Party contacts, auto-completes the task, and notifies admins. Managed in Settings > Inquiry Forms tab. Submissions stored in `task_form_submissions`. Auto-email via Resend on stage move.
-   **Site Modes**: Supports `landing` mode for a "Coming Soon" page with email collection and `full` mode for normal application access, controlled by feature flags.
-   **Quote PDF Generator**: Server-side PDF generation using `pdf-lib` with customizable templates. Two template types: `summary` (configurable sections/branding) and `loi` (Letter of Intent — fixed 3-page BPL Term Loan format). Admins manage PDF templates in Settings > Quote PDFs (company name, tagline, colors, sections, fields, disclaimer). Templates stored in `quote_pdf_templates` table with jsonb config including `templateType` and `loiDefaults`. Two download endpoints: `GET /api/quotes/:id/pdf` for saved quotes, `POST /api/pricing/pdf` for unsaved pricing results. LOI templates support editable defaults (fees, legal text, loan terms) via a full-preview modal in the admin editor. Generator utilities at `server/pdf/quoteGenerator.ts` (summary) and `server/pdf/loiGenerator.ts` (LOI).
-   **Post-Quote Document Selection**: After saving a quote from the pricing results page, users are navigated to `/quotes/:id/documents` (page at `client/src/pages/quote-documents.tsx`) where they can select a document template (Summary PDF or LOI) to download or send for e-signature. Features inline PDF preview using `react-pdf` v9 / `pdfjs-dist` v4 (pages rendered at container width, scrollable), template sidebar for switching between Summary and LOI templates, and an Edit Quote panel (`PATCH /api/quotes/:id`) for modifying borrower/property/loan fields with live PDF regeneration on save.
-   **Internal E-Signature Flow**: "Send for Signature" on the document preview page uses an internal signing system (not PandaDoc). It generates the PDF, creates a document record with pre-positioned signature fields (auto-extracted from the LOI Borrower Acceptance section), and emails a secure signing link via Resend. Borrowers open `/sign/:token`, see the document with signature field pre-positioned, draw their signature, and submit. Endpoint: `POST /api/quotes/:id/send-internal-signature`.
-   **Auto-Generated Loan Numbers**: Quotes get auto-generated loan numbers in `SPX-XXXX` format (starting at SPX-1124, incrementing by 1). Stored in `saved_quotes.loan_number` column. Displayed in LOI PDFs, document preview page header, and PDF download filenames. Generated in `storage.generateQuoteLoanNumber()`.

## External Dependencies

-   **Apify**: Web scraping for external pricing providers.
-   **PostgreSQL**: Primary database.
-   **PandaDoc**: E-signing, status synchronization, and document retrieval.
-   **Resend**: Email sending.
-   **Twilio**: SMS messaging.
-   **Google OAuth 2.0**: Authentication and Google Drive integration.
-   **Google Drive API**: For folder creation and document synchronization.
-   **n8n / External LOS**: Optional webhook integrations.