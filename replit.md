# Loan Pricing White-Label Tool

## Overview
This project is a white-label loan pricing application designed for Sphinx Capital. Its core purpose is to automate and streamline the loan pricing process, enhance sales efficiency, and provide comprehensive tools for managing quotes, agreements, and the entire loan closing lifecycle. The application integrates with external pricing providers while maintaining confidentiality for proprietary sources. It aims to offer a robust platform for internal administrative use and a seamless borrower experience, thereby improving loan origination and management capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is built on a modern web stack, utilizing React 18 with TypeScript for the frontend, Express.js with TypeScript for the backend, and PostgreSQL with Drizzle ORM for data persistence.

**Frontend:**
-   **Technology Stack**: React 18, TypeScript, Wouter, TanStack React Query, Tailwind CSS (shadcn/ui New York style), Framer Motion, React Hook Form with Zod, Vite.
-   **Key Features**: Loan pricing forms (DSCR, Fix and Flip/Ground Up Construction), quote and agreement management (PDF, e-signatures, document timelines), multi-stage deal/loan management, borrower portal with token-based access, borrower quote flow, and a comprehensive admin back office with dashboards, user management, and loan program configuration. It includes onboarding wizards for new lenders and for creating loan programs with a customizable quote form builder. A Commercial Deal Submission Module with AI-powered pre-screener and review engine is also integrated.

**Backend:**
-   **Technology Stack**: Express.js, TypeScript, Drizzle ORM, RESTful API, Zod for validation.
-   **Core Functionality**: JWT-based authentication with httpOnly cookies and Google OAuth 2.0 support, multi-tenant architecture, user type differentiation (Brokers/Borrowers), deal-linked messaging, and automated notification systems. It orchestrates frontend input with external pricing requests and interest rate retrieval.
-   **SOC 2 Compliance Layer**: Includes robust security features such as account lockout, immutable audit logging for authentication events, password expiry and complexity enforcement, bcrypt hashing, JWT token invalidation, PII encryption middleware, and Content-Security-Policy.
-   **API Key Management System**: SOC 2-compliant API key infrastructure with hashed storage, scope-based access control, per-key rate limiting, and complete usage audit trails.
-   **Webhook System**: SOC 2-compliant webhook infrastructure featuring HMAC-SHA256 signature verification, SSRF protection, exponential backoff retry, and timing-safe signature comparison.

**Database Schema Highlights**: Manages users, pricing requests, quotes, documents, e-signatures, audit logs, projects (deals), tasks, activities, system settings, admin tasks, partners, loan programs, message threads, onboarding progress, loan digest configurations, and commercial loan submissions. Projects table includes dedicated loan detail columns: `ysp`, `lenderOriginationPoints`, `brokerOriginationPoints`, `brokerName`, `prepaymentPenalty`, `holdbackAmount` — populated from quote data on deal creation and editable via the Loan Details card.

**Key Architectural Decisions:**
-   **Google Drive Integration**: Automates folder creation and document synchronization for projects using super_admin's OAuth tokens.
-   **Multi-Property Support**: Handles multiple properties per loan with full CRUD operations and property addresses used for document linking and AI review.
-   **Program-to-Deal Sync**: Non-destructively propagates changes from loan program templates to associated existing deals.
-   **Unified Checklist System**: Implements a single source of truth for checklists across admin, broker, and borrower views using role-based filtering.
-   **Multi-Tenancy (Full Data Isolation)**: Ensures complete tenant isolation with `tenantId` columns in key tables and robust tenant resolution logic.
-   **AI Draft Messages Panel**: A floating sticky panel on the deal detail page displaying AI-generated communication drafts for approval.
-   **Deal Memory System**: A persistent right sidebar on the deal detail page that serves as the AI communication agent's historical context, injecting relevant context into AI interactions.
-   **Gmail Integration**: Opt-in email integration allowing lenders to connect Gmail accounts for syncing threads, messages, and attachments, with features like in-app inbox, deal linking, and notifications.
-   **Terminology**: While the database uses `projects`, the UI consistently refers to entities as "Deals" or "Loans". Loan numbers are auto-generated.
-   **Pipeline Design System**: A documented visual language applied across admin pages, defining consistent UI elements, typography, and component styling.
-   **Admin Dashboard**: Provides key performance indicators (KPIs), a task board, and a list of recent deals for administrative oversight.
-   **Quotes Page**: A unified interface for managing quotes, displaying KPIs, full-width quote cards with action buttons, PandaDoc status integration, and options to convert signed quotes to deals.
-   **Term Sheet Signed Notification**: In-app notifications are triggered when a PandaDoc status changes to `completed`, alerting relevant users.
-   **Loan Programs Page**: Restyled to the Pipeline design system with expanded table columns, search and filter capabilities, rich expanded row details, and an action bar for managing programs.
-   **Program Creation Wizard**: A multi-step wizard for creating loan programs, featuring template selection, credit policy definition, customizable quote forms, stage management, document and task assignment, AI rule configuration, pricing setup, and review and activation options. DSCR quote form defaults include comprehensive property fields (address with auto-fill state/zip, conditional refinance/purchase fields, annualHOA, auto-calculated DSCR) and borrower entity/member fields with a repeatable "Add Member" pattern.
-   **Extended QuoteFormField Type**: Supports `fieldType` values `date`, `radio`, `address` (AddressAutocomplete) plus properties `readOnly`, `autoFilledFrom`, `computedFrom`, `repeatable`, `repeatGroupKey` for computed fields, auto-filled fields, and repeatable member groups.
-   **Program-Driven Deal Detail Cards**: The deal detail Overview tab dynamically renders Loan Details, Property Details, and Borrower Details cards based on the program's `quoteFormFields` configuration. Each form field has a `displayGroup` (`loan_details`, `property_details`, or `borrower_details`) that determines which card it appears in. The Loan Details card has "locked" fields (LTV, YSP, Interest Rate, Lender/Broker Origination Points, Broker Name, Holdback Amount, Term) that always appear regardless of program config. The `GET /api/admin/deals/:id` endpoint includes the program's `quoteFormFields` in its response. When no program is set, cards fall back to hardcoded default fields. Server-side role enforcement prevents non-admin users from modifying `ysp`, `lenderOriginationPoints`, and `brokerOriginationPoints` on both PUT and PATCH project endpoints.

## External Dependencies

-   **Apify**: Cloud-based web scraping for external pricing providers.
-   **PostgreSQL**: Primary relational database.
-   **PandaDoc**: E-signing service for agreement management, status synchronization, and document retrieval.
-   **Resend**: Email sending service.
-   **Twilio**: SMS messaging service.
-   **Google OAuth 2.0**: For user authentication and Google Drive integration.
-   **Google Drive API**: For automatic project folder creation and document synchronization.
-   **n8n / External LOS**: Optional webhook integrations for automation and Loan Origination Systems.