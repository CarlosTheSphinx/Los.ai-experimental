# Loan Pricing White-Label Tool

## Overview

This project is a white-label loan pricing application designed for Sphinx Capital, enabling sales representatives to efficiently input loan details and retrieve interest rates. The system automates the submission of loan information to an external pricing provider using Apify's Puppeteer scraper, ensuring that proprietary pricing sources remain undisclosed to end-users.

The application comprises a React frontend for data entry, an Express backend for orchestrating pricing requests, and a PostgreSQL database for persisting quotes, agreements, and operational logs. It aims to streamline the loan pricing process, enhance sales efficiency, and provide comprehensive tools for managing quotes, agreements, and the entire loan closing lifecycle, including a borrower-facing portal and robust admin capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application is built with a modern web stack, utilizing React 18 with TypeScript for the frontend and Express.js with TypeScript for the backend. Data persistence is handled by PostgreSQL, accessed via Drizzle ORM.

**Frontend:**
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS with shadcn/ui components (New York style)
- **Animations**: Framer Motion
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

The frontend features a left sidebar navigation leading to key sections:
- **New Quote**: Loan pricing form with loan product type selector supporting two loan types:
  - **DSCR (Debt Service Coverage Ratio)**: Includes gross monthly rent, annual taxes/insurance, calculated DSCR ratio, LTV calculations.
  - **Fix and Flip / RTL (Residential Transitional Loan)**: Pricing details pending configuration.
- **Saved Quotes**: Management of saved pricing quotes with document status.
- **Agreements**: Comprehensive agreement management including filtering, search, and detailed views with PDF viewer, field overlays, signers panel, and document timeline.
- **Projects**: Loan closing progress management with project cards, task checklists, activity timelines, document management, and borrower portal link sharing.
- **Borrower Portal**: A public, token-based portal for borrowers to view loan progress and tasks.
- **Admin Back Office**: A comprehensive set of tools for staff, including dashboards, user management, project oversight, system settings, partner management, and loan program configuration. This includes role-based access control with `user`, `staff`, `admin`, and `super_admin` roles.

**Backend:**
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **API Pattern**: RESTful endpoints
- **Validation**: Zod schemas (shared with frontend)
- **Authentication**: JWT tokens in httpOnly cookies with bcrypt password hashing, supporting multi-tenant authentication with data isolation.

**Authentication System:**
The system employs a robust authentication system supporting multi-tenancy and data isolation. It uses bcrypt for password hashing and JWT tokens in httpOnly cookies for session management. Public routes exist for registration, login, logout, and password recovery, while most API endpoints are protected, requiring authentication. Token-based access is implemented for document signing and the borrower portal.

**Project System:**
A core feature is the project management system, which tracks the 9-stage loan closing process. Projects include tasks with priorities, borrower visibility flags, an activity timeline, and document management. Projects are automatically created upon agreement completion, populating data from linked quotes and enabling the borrower portal.

**Admin Back Office System:**
The admin system provides role-based access for managing users, deals, projects, partners, and loan programs. It includes an admin dashboard, a deals dashboard for tracking cumulative deals, user management, global project oversight, system settings configuration, and a partners management section. Loan programs can be configured with associated document and task templates, which auto-populate for new deals based on loan type.

**Data Flow:**
User input from the frontend is validated, then the backend triggers an Apify actor with loan parameters. The Apify script scrapes the external pricing provider, and the interest rate is returned to the user. Users can save quotes with customer details and commission calculations.

**Database Schema Highlights:**
Key tables include `users`, `pricing_requests`, `saved_quotes`, `documents`, `signers`, `document_fields`, `audit_logs`, `projects`, `project_stages`, `project_tasks`, `project_activity`, `project_documents`, `project_webhooks`, `system_settings`, `admin_tasks`, `admin_activity`, `partners`, `loanPrograms`, `programDocumentTemplates`, and `programTaskTemplates`. Foreign keys with CASCADE delete ensure data integrity and isolation.

## External Dependencies

- **Apify**: Cloud-based web scraping platform for automating interactions with external pricing providers.
- **PostgreSQL**: The primary relational database for all application data.

**Required Environment Variables:**
- `DATABASE_URL`: PostgreSQL connection string.
- `APIFY_TOKEN`: API token for Apify client.
- `JWT_SECRET`: Secret key for JWT token signing.
- `SESSION_SECRET`: Secret for session management.

**Optional Environment Variables (for Projects/Webhooks):**
- `N8N_WEBHOOK_URL`: Webhook URL for n8n automation.
- `EXTERNAL_LOS_WEBHOOK_URL`: Webhook URL for integration with an external Loan Origination System.
- `WEBHOOK_URLS`: JSON array of additional webhook endpoints.
- `BASE_URL`: Base URL for generating borrower portal links.