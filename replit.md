# Loan Pricing White-Label Tool

## Overview
This project is a white-label loan pricing application for Sphinx Capital. Its primary purpose is to automate and streamline the loan pricing process, enhance sales efficiency, and provide comprehensive tools for managing quotes, agreements, and the entire loan closing lifecycle. The application integrates with external pricing providers while maintaining confidentiality for proprietary sources. It aims to offer a robust platform for internal administrative use and a seamless borrower experience, thereby improving loan origination and management capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is built on a modern web stack, utilizing React 18 with TypeScript for the frontend, Express.js with TypeScript for the backend, and PostgreSQL with Drizzle ORM for data persistence.

**Frontend:**
-   **Technology Stack**: React 18, TypeScript, Wouter, TanStack React Query, Tailwind CSS (shadcn/ui New York style), Framer Motion, React Hook Form with Zod, Vite.
-   **Key Features**: Loan pricing forms (DSCR, Fix and Flip/Ground Up Construction), quote and agreement management (PDF, e-signatures, document timelines), multi-stage deal/loan management, borrower portal with token-based access, borrower quote flow, and a comprehensive admin back office with dashboards, user management, and loan program configuration. It includes a 5-step onboarding wizard for new lenders and an 8-step wizard for creating loan programs with a customizable quote form builder. A Commercial Deal Submission Module with AI-powered pre-screener and review engine is also integrated.

**Backend:**
-   **Technology Stack**: Express.js, TypeScript, Drizzle ORM, RESTful API, Zod for validation.
-   **Core Functionality**: JWT-based authentication with httpOnly cookies and Google OAuth 2.0 support, multi-tenant architecture, user type differentiation (Brokers/Borrowers), deal-linked messaging, and automated notification systems. It orchestrates frontend input with external pricing requests and interest rate retrieval.

**Database Schema Highlights**: Manages users, pricing requests, quotes, documents, e-signatures, audit logs, projects (deals), tasks, activities, system settings, admin tasks, partners, loan programs, message threads, onboarding progress, loan digest configurations, and commercial loan submissions.

**Key Architectural Decisions:**
-   **Google Drive Integration**: Automates folder creation and document synchronization for projects using super_admin's OAuth tokens.
-   **Multi-Property Support**: Handles multiple properties per loan with full CRUD operations and property addresses used for document linking and AI review.
-   **Program-to-Deal Sync**: Non-destructively propagates changes from loan program templates to associated existing deals.
-   **Unified Checklist System**: Implements a single source of truth for checklists across admin, broker, and borrower views using role-based filtering on `deal_documents` and `project_tasks` tables.
-   **Multi-Tenancy (Full Data Isolation)**: Ensures complete tenant isolation with `tenantId` columns in key tables and robust tenant resolution logic. Super admins have a dedicated management interface.
-   **AI Draft Messages Panel**: A floating sticky panel on the deal detail page displaying AI-generated communication drafts for approval, triggered by "Auto Process" and polling for updates.
-   **Deal Memory System**: A persistent right sidebar on the deal detail page (replacing "Deal Story") that serves as the AI communication agent's historical context, populating from `deal_memory_entries` and `deal_notes`. This system injects relevant context into AI interactions.
-   **Gmail Integration**: Opt-in email integration allowing lenders to connect Gmail accounts for syncing threads, messages, and attachments, with features like in-app inbox, deal linking, and notifications.
-   **Terminology**: While the database uses `projects`, the UI consistently refers to entities as "Deals" or "Loans". Loan numbers are auto-generated based on street names and sequential digits.
-   **Pipeline Design System**: A documented visual language (`references/pipeline-design-system.md`) extracted from the Pipeline page (deals-v2.tsx) applied across admin pages. Key patterns: `text-[26px]` page titles, `text-[16px]` body text, `rounded-[10px] shadow-sm` card containers, `text-[13px] uppercase tracking-wider` column headers, color-coded initials avatars, status pill badges.
-   **Loan Programs Page (programs-v2.tsx)**: Restyled to Pipeline design system with expanded table columns (Program, LTV Range, Min DSCR, Property Types pills, Status badge, Active toggle, Edit button), toolbar with search + status/property-type filter dropdowns, rich expanded row details (Key Metrics, Workflow stats, Term Options/Loan Purpose), and action bar (Edit/Duplicate/View Deals/Export). Duplicate program API at `POST /api/admin/programs/:id/duplicate`.
-   **Program Creation Wizard (ProgramCreationWizard.tsx)**: Restyled with 10-step vertical sidebar navigation (Template → Credit Policy → Program Details → Quote Form → Stages → Documents → Tasks → AI Rules → Pricing → Review & Create). Template Selection step (Step 1) offers 6 template cards (DSCR, Bridge/Fix & Flip, Bank Statement, Construction, Commercial, Blank). Program Details step restructured with 3-column field grids including `minDscr` and `minFico` (new DB columns), checkbox-based property types using canonical values (`single-family`, `2-4-unit`, `condo`, `townhouse`, `pud`, `multi-family`, `commercial`, `mixed-use`). Footer: Back/Skip this step/Continue navigation. Pipeline design system font scaling applied throughout. **Stages step** uses a vertical timeline with colored dots (`STAGE_COLORS` palette), inline-editable names/descriptions, drag-and-drop reordering, and `description` field on `StageEntry`. **Documents step** groups documents by stage using the same colored timeline, with inline-editable names, category badges (Borrower/Financial/Entity/Property/Closing), Required/Optional dropdown, per-stage "Add" buttons, quick-add bulk buttons for standard doc categories, and an "Unassigned" section with amber highlight for docs not yet assigned to a stage. **Tasks step** mirrors the Documents layout — stage-grouped timeline with inline-editable task names, priority badges (Critical/High/Medium/Low), team member assignment dropdown (individual users + role-based), stage reassignment, and per-stage inline add forms.

## External Dependencies

-   **Apify**: Cloud-based web scraping for external pricing providers.
-   **PostgreSQL**: Primary relational database.
-   **PandaDoc**: E-signing service for agreement management, handling status synchronization, signed document retrieval, and integration into the deal's document section.
-   **Resend**: Email sending service.
-   **Twilio**: SMS messaging service.
-   **Google OAuth 2.0**: For user authentication and Google Drive integration.
-   **Google Drive API**: For automatic project folder creation and document synchronization.
-   **n8n / External LOS**: Optional webhook integrations for automation and Loan Origination Systems.