CREATE TABLE "admin_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"user_id" integer,
	"action_type" varchar(100) NOT NULL,
	"action_description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"task_title" varchar(255) NOT NULL,
	"task_description" text,
	"task_category" varchar(100),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"priority" varchar(50) DEFAULT 'medium',
	"assigned_to" integer,
	"due_date" timestamp,
	"user_milestone_stage_id" integer,
	"user_milestone_task_id" integer,
	"auto_update_user_task" boolean DEFAULT true,
	"completed_at" timestamp,
	"completed_by" integer,
	"requires_document" boolean DEFAULT false,
	"document_id" integer,
	"internal_notes" text,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"agent_run_id" integer,
	"recipient_type" varchar(50) NOT NULL,
	"recipient_name" varchar(255),
	"recipient_email" varchar(255),
	"subject" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"html_body" text,
	"priority" varchar(50) DEFAULT 'routine' NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"finding_ids" jsonb,
	"suggested_follow_up_date" timestamp,
	"internal_notes" text,
	"edited_body" text,
	"approved_by" integer,
	"approved_at" timestamp,
	"sent_at" timestamp,
	"sent_via" varchar(50),
	"scheduled_send_date" timestamp,
	"source_trigger" varchar(50),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_configurations" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"system_prompt" text NOT NULL,
	"tool_definitions" jsonb,
	"model_provider" varchar(50) DEFAULT 'openai' NOT NULL,
	"model_name" varchar(100) DEFAULT 'gpt-4o' NOT NULL,
	"temperature" real DEFAULT 0.2 NOT NULL,
	"max_tokens" integer DEFAULT 4096 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"tenant_overrides" jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"project_id" integer,
	"original_output" text NOT NULL,
	"corrected_output" text NOT NULL,
	"correction_type" varchar(50),
	"context" jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"program_id" integer,
	"agent_run_id" integer,
	"overall_status" varchar(50),
	"policy_findings" jsonb,
	"document_requirement_findings" jsonb,
	"cross_document_consistency" jsonb,
	"missing_documents" jsonb,
	"deal_health_summary" jsonb,
	"recommended_next_actions" jsonb,
	"raw_output" jsonb,
	"lender_decision" varchar(50),
	"lender_decision_by" integer,
	"lender_decision_at" timestamp,
	"lender_decision_notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'queued' NOT NULL,
	"agent_sequence" jsonb NOT NULL,
	"current_agent_index" integer DEFAULT 0 NOT NULL,
	"trigger_type" varchar(50) DEFAULT 'manual' NOT NULL,
	"triggered_by" integer,
	"error_message" text,
	"total_duration_ms" integer,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"project_id" integer,
	"configuration_id" integer,
	"status" varchar(50) DEFAULT 'running' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost" real,
	"duration_ms" integer,
	"error_message" text,
	"trigger_type" varchar(50),
	"triggered_by" integer,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_assistant_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"deal_id" integer,
	"conversation_type" varchar(50) NOT NULL,
	"title" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_assistant_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"actions_taken" jsonb,
	"voice_input" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_key_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_key_id" integer NOT NULL,
	"endpoint" varchar(255),
	"method" varchar(10),
	"status_code" integer,
	"ip_address" text,
	"user_agent" text,
	"scope_required" jsonb,
	"scope_granted" jsonb,
	"authorized" boolean DEFAULT true,
	"error_message" text,
	"request_id" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"response_time_ms" integer
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"key_prefix" varchar(10) NOT NULL,
	"key_hash" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"scopes" jsonb DEFAULT '[]' NOT NULL,
	"expires_at" timestamp,
	"is_revoked" boolean DEFAULT false,
	"last_used_at" timestamp,
	"usage_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"user_id" integer,
	"user_email" varchar(255),
	"user_role" varchar(50),
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(100),
	"resource_id" varchar(255),
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"status_code" integer,
	"success" boolean DEFAULT true,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "beta_signups" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"company" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "beta_signups_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "borrower_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"borrower_profile_id" integer NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_type" varchar(100),
	"file_size" integer,
	"storage_path" text,
	"category" varchar(100),
	"document_classification" varchar(20) DEFAULT 'standalone',
	"description" text,
	"expiration_date" varchar(20),
	"is_active" boolean DEFAULT true,
	"source_deal_id" integer,
	"source_deal_name" varchar(500),
	"uploaded_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "borrower_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"phone" varchar(50),
	"date_of_birth" varchar(20),
	"street_address" text,
	"city" varchar(100),
	"state" varchar(50),
	"zip_code" varchar(20),
	"ssn_last4" varchar(4),
	"id_type" varchar(50),
	"id_number" varchar(100),
	"id_expiration_date" varchar(20),
	"employer_name" varchar(255),
	"employment_title" varchar(255),
	"annual_income" real,
	"employment_type" varchar(50),
	"entity_name" varchar(255),
	"entity_type" varchar(50),
	"ein_number" varchar(20),
	"profile_data" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "borrower_profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "broker_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"broker_id" integer NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"company" varchar(255),
	"contact_type" varchar(50) NOT NULL,
	"last_contacted_at" timestamp,
	"notes" text,
	"tags" jsonb,
	"source" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "broker_outreach_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"broker_id" integer NOT NULL,
	"contact_id" integer,
	"campaign_id" integer,
	"channel" varchar(50) NOT NULL,
	"subject" varchar(255),
	"body" text NOT NULL,
	"personalized_body" text,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"ai_generated" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commercial_form_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"field_key" varchar(100) NOT NULL,
	"field_label" varchar(255) NOT NULL,
	"section" varchar(100) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"display_format" varchar(50) DEFAULT 'plain',
	"is_visible" boolean DEFAULT true NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"options" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_submission_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"doc_type" varchar(50) NOT NULL,
	"storage_key" text NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commercial_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"status" varchar(50) DEFAULT 'NEW' NOT NULL,
	"submitter_type" varchar(50) NOT NULL,
	"broker_or_developer_name" varchar(255) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"role_on_deal" varchar(100) NOT NULL,
	"loan_type" varchar(50) NOT NULL,
	"requested_loan_amount" real NOT NULL,
	"requested_ltv" real,
	"requested_ltc" real,
	"interest_only" boolean NOT NULL,
	"desired_close_date" timestamp NOT NULL,
	"exit_strategy_type" varchar(50),
	"exit_strategy_details" text,
	"property_name" varchar(255) NOT NULL,
	"property_address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(2) NOT NULL,
	"zip" varchar(10) NOT NULL,
	"property_type" varchar(50) NOT NULL,
	"occupancy_type" varchar(50) NOT NULL,
	"units_or_sqft" real NOT NULL,
	"year_built" integer,
	"purchase_price" real,
	"as_is_value" real NOT NULL,
	"arv_or_stabilized_value" real,
	"current_noi" real,
	"in_place_rent" real,
	"pro_forma_noi" real,
	"capex_budget_total" real NOT NULL,
	"business_plan_summary" text NOT NULL,
	"primary_sponsor_name" varchar(255) NOT NULL,
	"primary_sponsor_experience_years" integer NOT NULL,
	"number_of_similar_projects" integer NOT NULL,
	"net_worth" real NOT NULL,
	"liquidity" real NOT NULL,
	"admin_notes" text,
	"county" varchar(100),
	"square_footage" real,
	"current_occupancy" real,
	"loan_purpose" varchar(100),
	"requested_loan_term" integer,
	"closing_timeline" varchar(50),
	"current_annual_debt_service" real,
	"market_rent_psf" real,
	"property_taxes_annual" real,
	"insurance_annual" real,
	"ltv_calculated" real,
	"dscr_calculated" real,
	"total_project_cost" real,
	"land_acquisition_cost" real,
	"hard_costs" real,
	"soft_costs" real,
	"contingency" real,
	"contingency_percent" real,
	"project_timeline" integer,
	"construction_start_date" timestamp,
	"stabilization_date" timestamp,
	"general_contractor" varchar(255),
	"gc_licensed_bonded" boolean,
	"entity_name" varchar(255),
	"entity_type" varchar(50),
	"entity_date_established" timestamp,
	"ownership_structure" varchar(100),
	"sponsor_credit_score" varchar(20),
	"personal_liquidity" real,
	"personal_net_worth" real,
	"total_units_sf_owned" varchar(255),
	"current_portfolio_value" real,
	"similar_deals_last_3_years" integer,
	"ever_defaulted" boolean DEFAULT false,
	"default_explanation" text,
	"current_litigation" boolean DEFAULT false,
	"litigation_explanation" text,
	"bankruptcy_last_7_years" boolean DEFAULT false,
	"bankruptcy_explanation" text,
	"property_condition" varchar(50),
	"deferred_maintenance_estimate" real,
	"deferred_maintenance_percent" real,
	"environmental_issues" boolean DEFAULT false,
	"environmental_description" text,
	"zoning" varchar(100),
	"zoning_compliant" boolean,
	"number_of_units" integer,
	"unit_mix_studios" integer,
	"unit_mix_1br" integer,
	"unit_mix_2br" integer,
	"unit_mix_3br" integer,
	"average_rent" real,
	"market_rent" real,
	"number_of_tenants" integer,
	"largest_tenant" varchar(255),
	"largest_tenant_percent" real,
	"average_lease_term_remaining" real,
	"tenant_credit_quality" varchar(50),
	"current_lender" varchar(255),
	"current_loan_balance" real,
	"current_interest_rate" real,
	"loan_maturity_date" timestamp,
	"prepayment_penalty" real,
	"additional_notes" text,
	"ai_decision" varchar(50),
	"ai_decision_reason" text,
	"reviewed_at" timestamp,
	"submitted_at" timestamp,
	"assigned_to" integer,
	"expires_at" timestamp,
	"drive_folder_id" varchar(255),
	"drive_folder_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comms_automation_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"automation_id" integer NOT NULL,
	"order_index" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"config" jsonb
);
--> statement-breakpoint
CREATE TABLE "comms_automation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"automation_id" integer NOT NULL,
	"subject_type" varchar(20) NOT NULL,
	"subject_id" integer NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"current_node_id" integer,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"exit_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_automations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"trigger_config" jsonb,
	"exit_conditions" jsonb,
	"notify_broker_on_send" boolean DEFAULT false NOT NULL,
	"max_duration_days" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"owner_user_id" integer,
	"type" varchar(20) NOT NULL,
	"config" jsonb,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_consent_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"channel" varchar(20) NOT NULL,
	"consented_at" timestamp DEFAULT now() NOT NULL,
	"source" varchar(30) NOT NULL,
	"consent_text" text
);
--> statement-breakpoint
CREATE TABLE "comms_merge_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"resolver_fn_name" varchar(100) NOT NULL,
	"channel_formatting" jsonb,
	CONSTRAINT "comms_merge_tags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "comms_opt_outs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"contact_value" text NOT NULL,
	"channel" varchar(20) NOT NULL,
	"opted_out_at" timestamp DEFAULT now() NOT NULL,
	"source" varchar(30) NOT NULL,
	"recipient_id" integer
);
--> statement-breakpoint
CREATE TABLE "comms_scheduled_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"node_id" integer NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"filter_config" jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_send_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"run_id" integer,
	"node_id" integer,
	"channel" varchar(20) NOT NULL,
	"template_id" integer,
	"template_version" integer NOT NULL,
	"recipient_type" varchar(20) NOT NULL,
	"recipient_id" integer NOT NULL,
	"recipient_contact_value" text NOT NULL,
	"resolved_body" text NOT NULL,
	"resolved_subject" text,
	"resolved_merge_tags" jsonb,
	"status" varchar(20) NOT NULL,
	"failure_reason" text,
	"delivery_events" jsonb DEFAULT '[]'::jsonb,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"source_file_name" varchar(500),
	"is_active" boolean DEFAULT true,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_document_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"file_path" text NOT NULL,
	"file_name" text,
	"file_size" integer,
	"mime_type" varchar(100),
	"uploaded_at" timestamp DEFAULT now(),
	"uploaded_by" integer,
	"sort_order" integer DEFAULT 0,
	"google_drive_file_id" varchar(255),
	"google_drive_file_url" text,
	"drive_upload_status" varchar(50) DEFAULT 'NOT_SYNCED',
	"drive_upload_error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"stage_id" integer,
	"program_document_template_id" integer,
	"deal_property_id" integer,
	"document_name" varchar(255) NOT NULL,
	"document_category" varchar(100),
	"document_description" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"is_required" boolean DEFAULT true,
	"assigned_to" varchar(50) DEFAULT 'borrower',
	"visibility" varchar(50) DEFAULT 'all',
	"file_path" text,
	"file_name" text,
	"file_size" integer,
	"mime_type" varchar(100),
	"uploaded_at" timestamp,
	"uploaded_by" integer,
	"reviewed_at" timestamp,
	"reviewed_by" integer,
	"review_notes" text,
	"ai_review_status" varchar(50) DEFAULT 'not_reviewed',
	"ai_review_reason" text,
	"ai_reviewed_at" timestamp,
	"ai_review_confidence" real,
	"sort_order" integer DEFAULT 0,
	"google_drive_file_id" varchar(255),
	"google_drive_file_url" text,
	"drive_upload_status" varchar(50) DEFAULT 'NOT_SYNCED',
	"drive_upload_error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_memory_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"entry_type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"source_type" varchar(30),
	"source_user_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"note_type" varchar(30) DEFAULT 'note' NOT NULL,
	"mentions" jsonb,
	"is_pinned" boolean DEFAULT false,
	"parent_note_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_processors" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(100) DEFAULT 'processor',
	"assigned_at" timestamp DEFAULT now(),
	"assigned_by" integer
);
--> statement-breakpoint
CREATE TABLE "deal_properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100),
	"state" varchar(50),
	"zip" varchar(20),
	"property_type" varchar(100),
	"estimated_value" real,
	"units" integer,
	"monthly_rent" real,
	"annual_taxes" real,
	"annual_insurance" real,
	"is_primary" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"color" varchar(50) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "deal_stages_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "deal_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"color" varchar(50) DEFAULT '#6b7280',
	"description" text,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "deal_statuses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "deal_stories" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"current_narrative" text NOT NULL,
	"last_updated_section" varchar(100),
	"story_version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"last_agent_update" timestamp,
	"last_human_update" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "deal_stories_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "deal_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"task_name" varchar(255) NOT NULL,
	"task_description" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium',
	"assigned_to" integer,
	"due_date" timestamp,
	"stage_id" integer,
	"completed_at" timestamp,
	"completed_by" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_third_parties" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"role" varchar(100) NOT NULL,
	"company" varchar(255),
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"agreement_id" integer,
	"quote_id" integer,
	"project_name" varchar(255) NOT NULL,
	"project_number" varchar(50),
	"loan_number" varchar(10),
	"loan_amount" real,
	"interest_rate" real,
	"loan_term_months" integer,
	"loan_type" varchar(100),
	"program_id" integer,
	"property_address" text,
	"property_type" varchar(100),
	"borrower_name" varchar(255),
	"borrower_email" varchar(255),
	"borrower_phone" varchar(50),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"current_stage" varchar(100) DEFAULT 'documentation',
	"progress_percentage" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"application_date" timestamp,
	"target_close_date" timestamp,
	"actual_close_date" timestamp,
	"funding_date" timestamp,
	"last_updated" timestamp DEFAULT now(),
	"external_los_id" varchar(255),
	"external_sync_status" varchar(50),
	"external_sync_at" timestamp,
	"borrower_portal_token" varchar(255),
	"borrower_portal_enabled" boolean DEFAULT true,
	"borrower_portal_last_viewed" timestamp,
	"broker_portal_token" varchar(255),
	"broker_portal_enabled" boolean DEFAULT true,
	"ltv" real,
	"as_is_value" real,
	"property_state" varchar(50),
	"appraisal_status" varchar(50),
	"ysp" real,
	"lender_origination_points" real,
	"broker_origination_points" real,
	"broker_name" varchar(255),
	"broker_email" varchar(255),
	"broker_phone" varchar(50),
	"broker_company" varchar(255),
	"prepayment_penalty" varchar(100),
	"holdback_amount" real,
	"notes" text,
	"internal_notes" text,
	"is_archived" boolean DEFAULT false,
	"metadata" jsonb,
	"google_drive_folder_id" varchar(255),
	"google_drive_folder_url" text,
	"drive_sync_status" varchar(50) DEFAULT 'NOT_ENABLED',
	"drive_sync_error" text,
	"tenant_id" integer,
	"ai_review_mode" varchar(20) DEFAULT 'manual',
	"ai_review_interval_minutes" integer,
	"ai_review_scheduled_time" varchar(10),
	"ai_review_scheduled_days" jsonb,
	"ai_review_timezone" varchar(50),
	"ai_communication_frequency_minutes" integer,
	"ai_comm_auto_send" boolean DEFAULT false,
	"ai_comm_send_deadline" varchar(10),
	CONSTRAINT "projects_project_number_unique" UNIQUE("project_number"),
	CONSTRAINT "projects_loan_number_unique" UNIQUE("loan_number"),
	CONSTRAINT "projects_borrower_portal_token_unique" UNIQUE("borrower_portal_token"),
	CONSTRAINT "projects_broker_portal_token_unique" UNIQUE("broker_portal_token")
);
--> statement-breakpoint
CREATE TABLE "digest_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"delivery_method" varchar(20) NOT NULL,
	"recipient_address" varchar(255) NOT NULL,
	"documents_count" integer DEFAULT 0 NOT NULL,
	"updates_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(50) DEFAULT 'sent' NOT NULL,
	"error_message" text,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"last_digest_sent_at" timestamp NOT NULL,
	"next_digest_due_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"email_subject" varchar(255) NOT NULL,
	"email_body" text NOT NULL,
	"sms_body" text,
	"template_type" varchar(50) DEFAULT 'custom' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"signer_id" integer,
	"action" text NOT NULL,
	"details" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_download_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "document_download_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "document_extractions" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_document_id" integer,
	"project_id" integer NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"extracted_fields" jsonb DEFAULT '{}'::jsonb,
	"quality_assessment" jsonb,
	"anomalies" jsonb,
	"confidence_score" real,
	"classification_match" boolean,
	"confirmed_doc_type" varchar(100),
	"agent_run_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"signer_id" integer,
	"page_number" integer DEFAULT 1 NOT NULL,
	"field_type" text NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"value" text,
	"label" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_review_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"program_id" integer,
	"document_template_id" integer,
	"overall_status" varchar(50) NOT NULL,
	"summary" text,
	"findings" text,
	"rules_used" integer DEFAULT 0,
	"rules_passed" integer DEFAULT 0,
	"rules_failed" integer DEFAULT 0,
	"rules_warning" integer DEFAULT 0,
	"model" varchar(100),
	"reviewed_at" timestamp DEFAULT now(),
	"reviewed_by" integer
);
--> statement-breakpoint
CREATE TABLE "document_review_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"document_category" varchar(100) NOT NULL,
	"document_name" varchar(255) NOT NULL,
	"rule_name" varchar(255) NOT NULL,
	"rule_description" text,
	"rule_config" jsonb NOT NULL,
	"severity" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_guideline_id" integer,
	"confidence" real,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"pdf_url" text NOT NULL,
	"pdf_filename" varchar(255) NOT NULL,
	"page_dimensions" jsonb DEFAULT '[]',
	"page_count" integer DEFAULT 1 NOT NULL,
	"category" varchar(100),
	"loan_type" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"pandadoc_template_id" varchar(255),
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"quote_id" integer,
	"name" text NOT NULL,
	"file_name" text NOT NULL,
	"file_data" text NOT NULL,
	"page_count" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"vendor" text DEFAULT 'local',
	"pandadoc_document_id" text,
	"created_at" timestamp DEFAULT now(),
	"sent_at" timestamp,
	"completed_at" timestamp,
	"voided_at" timestamp,
	"voided_reason" text
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email_address" varchar(255) NOT NULL,
	"provider" varchar(50) DEFAULT 'gmail' NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"sync_status" varchar(50) DEFAULT 'idle',
	"history_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"gmail_message_id" varchar(255) NOT NULL,
	"from_address" varchar(255),
	"from_name" varchar(255),
	"to_addresses" text[],
	"cc_addresses" text[],
	"subject" varchar(500),
	"body_text" text,
	"body_html" text,
	"snippet" text,
	"attachments" jsonb,
	"internal_date" timestamp,
	"is_unread" boolean DEFAULT true,
	"label_ids" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_thread_deal_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_thread_id" integer NOT NULL,
	"deal_id" integer NOT NULL,
	"linked_by" integer,
	"linked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"gmail_thread_id" varchar(255) NOT NULL,
	"subject" varchar(500),
	"snippet" text,
	"from_address" varchar(255),
	"from_name" varchar(255),
	"participants" text[],
	"message_count" integer DEFAULT 0,
	"has_attachments" boolean DEFAULT false,
	"is_unread" boolean DEFAULT true,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esign_envelopes" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor" varchar(50) NOT NULL,
	"quote_id" integer,
	"template_id" integer,
	"project_id" integer,
	"external_document_id" varchar(255) NOT NULL,
	"external_template_id" varchar(255),
	"document_name" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"signing_url" text,
	"signed_pdf_url" text,
	"recipients" jsonb DEFAULT '[]',
	"send_method" varchar(20) DEFAULT 'email',
	"sent_at" timestamp,
	"viewed_at" timestamp,
	"completed_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esign_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor" varchar(50) NOT NULL,
	"envelope_id" integer,
	"external_document_id" varchar(255) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"event_data" jsonb DEFAULT '{}',
	"processed" boolean DEFAULT false,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_path" varchar(1000) NOT NULL,
	"file_size" integer,
	"mime_type" varchar(100),
	"extraction_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_knowledge_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"source_type" varchar(30) DEFAULT 'manual' NOT NULL,
	"source_document_name" varchar(500),
	"content" text NOT NULL,
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"fund_name" varchar(255) NOT NULL,
	"provider_name" varchar(255),
	"website" varchar(500),
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"guideline_url" varchar(1000),
	"ltv_min" real,
	"ltv_max" real,
	"ltc_min" real,
	"ltc_max" real,
	"loan_amount_min" integer,
	"loan_amount_max" integer,
	"interest_rate_min" real,
	"interest_rate_max" real,
	"term_min" integer,
	"term_max" integer,
	"recourse_type" varchar(50),
	"min_dscr" real,
	"min_credit_score" integer,
	"prepayment_terms" varchar(255),
	"closing_timeline" varchar(100),
	"origination_fee_min" real,
	"origination_fee_max" real,
	"allowed_states" jsonb,
	"allowed_asset_types" jsonb,
	"loan_strategy" varchar(50),
	"loan_types" jsonb,
	"fund_description" text,
	"description_embedding" vector(1536),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guideline_uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_path" text,
	"mime_type" varchar(100),
	"file_size" integer,
	"extracted_text" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp,
	"uploaded_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inbound_sms_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_phone" varchar(50) NOT NULL,
	"to_phone" varchar(50) NOT NULL,
	"body" text NOT NULL,
	"twilio_message_sid" varchar(255),
	"partner_id" integer,
	"broadcast_id" integer,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiry_form_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"fields" jsonb NOT NULL,
	"target_type" varchar(50) DEFAULT 'third_party' NOT NULL,
	"target_role" varchar(100),
	"is_system" boolean DEFAULT false,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intake_ai_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"agent1_validation" jsonb,
	"agent2_matching" jsonb,
	"agent3_feedback" jsonb,
	"overall_verdict" varchar(50),
	"confidence_score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_deal_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"file_name" varchar(500),
	"file_path" varchar(1000),
	"file_size" integer,
	"mime_type" varchar(100),
	"uploaded_by" integer,
	"is_current" boolean DEFAULT true NOT NULL,
	"comments" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_deal_fund_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"fund_id" integer NOT NULL,
	"submitted_by" integer,
	"fund_response_status" varchar(50) DEFAULT 'pending',
	"fund_response_at" timestamp,
	"notes" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_deal_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50) NOT NULL,
	"updated_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_deal_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"task_title" varchar(255) NOT NULL,
	"task_description" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"priority" varchar(50) DEFAULT 'medium',
	"assigned_to" varchar(255),
	"due_date" timestamp,
	"completed_at" timestamp,
	"completed_by" varchar(255),
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intake_deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"broker_id" integer,
	"deal_name" varchar(255),
	"loan_amount" integer,
	"asset_type" varchar(100),
	"loan_type" varchar(100),
	"number_of_units" integer,
	"property_address" varchar(500),
	"property_city" varchar(100),
	"property_state" varchar(100),
	"property_zip" varchar(10),
	"property_value" integer,
	"ltv_pct" real,
	"ltc_pct" real,
	"noi_annual" integer,
	"dscr" real,
	"occupancy_pct" integer,
	"borrower_name" varchar(255),
	"borrower_entity_type" varchar(50),
	"borrower_credit_score" integer,
	"has_guarantor" boolean DEFAULT false,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"deal_story_audio_url" text,
	"deal_story_transcript" text,
	"deal_form_json" jsonb,
	"broker_notes" jsonb DEFAULT '[]'::jsonb,
	"linked_project_id" integer,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_document_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"rule_name" varchar(255) NOT NULL,
	"conditions" jsonb NOT NULL,
	"required_documents" jsonb NOT NULL,
	"document_templates" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lender_agent_customizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"additional_prompt" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lender_review_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ai_review_mode" varchar(20) DEFAULT 'manual' NOT NULL,
	"timed_review_interval_minutes" integer DEFAULT 60,
	"last_timed_review_at" timestamp,
	"fail_alert_enabled" boolean DEFAULT true NOT NULL,
	"fail_alert_recipients" varchar(20) DEFAULT 'both' NOT NULL,
	"fail_alert_channels" jsonb DEFAULT '{"email":true,"sms":false,"inApp":true}'::jsonb NOT NULL,
	"pass_notify_enabled" boolean DEFAULT true NOT NULL,
	"pass_notify_channels" jsonb DEFAULT '{"email":false,"inApp":true}'::jsonb NOT NULL,
	"digest_auto_send" boolean DEFAULT false NOT NULL,
	"ai_draft_auto_send" boolean DEFAULT false NOT NULL,
	"draft_ready_notify_enabled" boolean DEFAULT true NOT NULL,
	"draft_ready_notify_channels" jsonb DEFAULT '{"email":true,"inApp":true}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "lender_review_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "lender_training_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"step_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'not_started' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lender_training_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"target_page" varchar(255) NOT NULL,
	"content_html" text,
	"video_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loan_digest_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"deal_id" integer,
	"frequency" varchar(50) DEFAULT 'daily' NOT NULL,
	"custom_days" integer,
	"time_of_day" varchar(10) DEFAULT '09:00' NOT NULL,
	"timezone" varchar(100) DEFAULT 'America/New_York' NOT NULL,
	"include_documents_needed" boolean DEFAULT true NOT NULL,
	"include_notes" boolean DEFAULT false NOT NULL,
	"include_messages" boolean DEFAULT false NOT NULL,
	"include_general_updates" boolean DEFAULT true NOT NULL,
	"email_subject" varchar(255) DEFAULT 'Loan Update: Action Required',
	"email_body" text DEFAULT 'Hello {{recipientName}},

Here''s an update on your loan for {{propertyAddress}}.

{{documentsSection}}

{{updatesSection}}

Please log in to your portal to take any necessary actions.

Best regards,
Lendry.AI',
	"sms_body" text DEFAULT 'Lendry.AI: {{documentsCount}} docs needed for your loan. Log in to your portal for details.',
	"communication_channels" jsonb DEFAULT '{"email":true,"sms":false,"inApp":true}'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"require_approval" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_digest_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_id" integer NOT NULL,
	"user_id" integer,
	"recipient_name" varchar(255),
	"recipient_email" varchar(255),
	"recipient_phone" varchar(50),
	"delivery_method" varchar(20) DEFAULT 'email' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"loan_type" varchar(50) NOT NULL,
	"min_loan_amount" real DEFAULT 100000,
	"max_loan_amount" real DEFAULT 5000000,
	"min_ltv" real DEFAULT 50,
	"max_ltv" real DEFAULT 80,
	"min_interest_rate" real DEFAULT 8,
	"max_interest_rate" real DEFAULT 15,
	"min_dscr" real,
	"min_fico" integer,
	"min_units" integer,
	"max_units" integer,
	"term_options" text,
	"eligible_property_types" text[],
	"quote_form_fields" jsonb,
	"pricing_mode" varchar(50) DEFAULT 'none',
	"external_pricing_config" jsonb,
	"ysp_enabled" boolean DEFAULT false,
	"ysp_broker_can_toggle" boolean DEFAULT false,
	"ysp_fixed_amount" real DEFAULT 0,
	"ysp_min" real DEFAULT 0,
	"ysp_max" real DEFAULT 3,
	"ysp_step" real DEFAULT 0.125,
	"base_points" real DEFAULT 1,
	"base_points_min" real DEFAULT 0.5,
	"base_points_max" real DEFAULT 3,
	"broker_points_enabled" boolean DEFAULT true,
	"broker_points_max" real DEFAULT 2,
	"broker_points_step" real DEFAULT 0.125,
	"is_active" boolean DEFAULT true,
	"is_template" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"review_guidelines" text,
	"credit_policy_id" integer,
	"created_by" integer,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loan_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"update_type" varchar(50) NOT NULL,
	"summary" text NOT NULL,
	"meta" jsonb,
	"performed_by" integer,
	"included_in_digest_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"success" boolean NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "message_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"last_read_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'general',
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_thread_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_by" integer,
	"subject" varchar(255),
	"is_closed" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"sender_id" integer,
	"sender_role" varchar(20) NOT NULL,
	"type" varchar(20) NOT NULL,
	"body" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"deal_id" integer,
	"link" varchar(500),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"file_url" text,
	"external_url" text,
	"thumbnail_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"target_user_type" varchar(50) DEFAULT 'broker' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_broadcast_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"broadcast_id" integer NOT NULL,
	"partner_id" integer,
	"partner_name" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"email_status" varchar(50) DEFAULT 'pending',
	"sms_status" varchar(50) DEFAULT 'pending',
	"email_error" text,
	"sms_error" text,
	"personalized_email_body" text,
	"personalized_sms_body" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"sent_by" integer,
	"subject" varchar(255) NOT NULL,
	"email_body" text NOT NULL,
	"sms_body" text,
	"send_email" boolean DEFAULT true NOT NULL,
	"send_sms" boolean DEFAULT false NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"sms_sent" integer DEFAULT 0 NOT NULL,
	"emails_failed" integer DEFAULT 0 NOT NULL,
	"sms_failed" integer DEFAULT 0 NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"company_name" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"entity_type" varchar(50),
	"experience_level" varchar(50) DEFAULT 'beginner',
	"notes" text,
	"is_active" boolean DEFAULT true,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pipeline_agent_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_type" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"step_order" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"trigger_condition" jsonb DEFAULT '{"type":"previous_step_complete","config":{}}'::jsonb NOT NULL,
	"input_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"retry_on_failure" boolean DEFAULT false NOT NULL,
	"max_retries" integer DEFAULT 1 NOT NULL,
	"timeout_seconds" integer DEFAULT 300 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pipeline_step_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"pipeline_run_id" integer NOT NULL,
	"agent_type" varchar(100) NOT NULL,
	"agent_run_id" integer,
	"sequence_index" integer NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"output_summary" jsonb,
	"input_context" jsonb,
	"duration_ms" integer,
	"error_message" text,
	"executed_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"ai_agents_enabled" boolean DEFAULT true NOT NULL,
	"commercial_lending_enabled" boolean DEFAULT true NOT NULL,
	"document_templates_enabled" boolean DEFAULT true NOT NULL,
	"smart_prospecting_enabled" boolean DEFAULT false NOT NULL,
	"auto_run_pipeline" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "pricing_field_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"tenant_id" integer,
	"text_inputs" jsonb,
	"dropdowns" jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pricing_quote_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer,
	"ruleset_id" integer,
	"user_id" integer,
	"inputs_json" jsonb NOT NULL,
	"outputs_json" jsonb NOT NULL,
	"eligible" boolean NOT NULL,
	"final_rate" real,
	"points" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pricing_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_data" jsonb NOT NULL,
	"response_data" jsonb,
	"status" text NOT NULL,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pricing_rulesets" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(255),
	"description" text,
	"rules_json" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"activated_at" timestamp,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "processor_daily_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"processor_id" integer,
	"deal_id" integer NOT NULL,
	"queue_date" timestamp NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"action_data" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"edited_content" text,
	"approved_by" integer,
	"approved_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "program_document_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"step_id" integer,
	"document_name" varchar(255) NOT NULL,
	"document_category" varchar(100) NOT NULL,
	"document_description" text,
	"is_required" boolean DEFAULT true,
	"assigned_to" varchar(50) DEFAULT 'borrower',
	"visibility" varchar(50) DEFAULT 'all',
	"sort_order" integer DEFAULT 0,
	"template_url" varchar(500),
	"template_file_name" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "program_review_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer,
	"credit_policy_id" integer,
	"document_template_id" integer,
	"document_type" varchar(100) NOT NULL,
	"rule_title" varchar(500) NOT NULL,
	"rule_description" text,
	"rule_type" varchar(50) DEFAULT 'general',
	"severity" varchar(20) DEFAULT 'fail',
	"category" varchar(100),
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "program_task_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"step_id" integer,
	"task_name" varchar(255) NOT NULL,
	"task_description" text,
	"task_category" varchar(100),
	"assign_to_role" varchar(50) DEFAULT 'admin',
	"visibility" varchar(50) DEFAULT 'all',
	"priority" varchar(20) DEFAULT 'medium',
	"sort_order" integer DEFAULT 0,
	"form_template_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "program_workflow_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"step_definition_id" integer NOT NULL,
	"step_order" integer NOT NULL,
	"is_required" boolean DEFAULT true,
	"estimated_days" integer,
	"color" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer,
	"activity_type" varchar(100) NOT NULL,
	"activity_description" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"metadata" jsonb,
	"visible_to_borrower" boolean DEFAULT false,
	"is_internal" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"task_id" integer,
	"document_name" varchar(255) NOT NULL,
	"document_type" varchar(100),
	"document_category" varchar(100),
	"file_path" text NOT NULL,
	"file_size" integer,
	"uploaded_by" integer,
	"uploaded_at" timestamp DEFAULT now(),
	"status" varchar(50) DEFAULT 'pending_review',
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"review_notes" text,
	"visible_to_borrower" boolean DEFAULT true,
	"google_drive_file_id" varchar(255),
	"google_drive_file_url" text,
	"google_drive_mime_type" varchar(255),
	"drive_upload_status" varchar(50) DEFAULT 'NOT_ENABLED',
	"drive_upload_error" text
);
--> statement-breakpoint
CREATE TABLE "project_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"program_step_id" integer,
	"stage_name" varchar(100) NOT NULL,
	"stage_key" varchar(50) NOT NULL,
	"stage_order" integer NOT NULL,
	"stage_description" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"estimated_duration_days" integer,
	"visible_to_borrower" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"stage_id" integer,
	"program_task_template_id" integer,
	"task_title" varchar(255) NOT NULL,
	"task_description" text,
	"task_type" varchar(100),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"priority" varchar(50) DEFAULT 'medium',
	"assigned_to" varchar(255),
	"due_date" timestamp,
	"completed_at" timestamp,
	"completed_by" varchar(255),
	"requires_document" boolean DEFAULT false,
	"document_id" integer,
	"document_url" text,
	"visible_to_borrower" boolean DEFAULT true,
	"borrower_action_required" boolean DEFAULT false,
	"form_template_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quote_pdf_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"name" varchar(255) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"rule_type" varchar(50) NOT NULL,
	"proposal_json" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"confidence" real,
	"reasoning" text,
	"source_text" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "saved_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"partner_id" integer,
	"partner_name" varchar(255),
	"customer_first_name" text NOT NULL,
	"customer_last_name" text NOT NULL,
	"customer_company_name" text,
	"customer_email" text,
	"customer_phone" text,
	"property_address" text NOT NULL,
	"loan_data" jsonb NOT NULL,
	"interest_rate" text NOT NULL,
	"points_charged" real DEFAULT 0 NOT NULL,
	"points_amount" real DEFAULT 0 NOT NULL,
	"tpo_premium_amount" real DEFAULT 0 NOT NULL,
	"total_revenue" real DEFAULT 0 NOT NULL,
	"commission" real DEFAULT 0 NOT NULL,
	"ysp_amount" real DEFAULT 0,
	"ysp_rate_impact" real DEFAULT 0,
	"ysp_dollar_amount" real DEFAULT 0,
	"base_points_charged" real DEFAULT 0,
	"broker_points_charged" real DEFAULT 0,
	"stage" varchar(50) DEFAULT 'initial-review' NOT NULL,
	"program_id" integer,
	"google_drive_folder_id" varchar(255),
	"google_drive_folder_url" text,
	"drive_sync_status" varchar(50) DEFAULT 'NOT_ENABLED',
	"drive_sync_error" text,
	"loan_number" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "saved_quotes_loan_number_unique" UNIQUE("loan_number")
);
--> statement-breakpoint
CREATE TABLE "scheduled_digest_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_id" integer NOT NULL,
	"project_id" integer,
	"scheduled_date" timestamp NOT NULL,
	"time_of_day" varchar(10) NOT NULL,
	"email_subject" varchar(255),
	"email_body" text,
	"sms_body" text,
	"documents_count" integer DEFAULT 0 NOT NULL,
	"updates_count" integer DEFAULT 0 NOT NULL,
	"recipients" jsonb DEFAULT '[]',
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"source" varchar(50) DEFAULT 'digest' NOT NULL,
	"source_comm_id" integer,
	"approved_by" integer,
	"approved_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signers" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"color" text DEFAULT '#3B82F6' NOT NULL,
	"signing_order" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text,
	"token_expires_at" timestamp,
	"signed_at" timestamp,
	"last_reminder_sent" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_ai_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"decision" varchar(50) NOT NULL,
	"decision_reason" text,
	"strengths" text,
	"concerns" text,
	"requested_documents" text,
	"decline_reasons" text,
	"manual_review_flags" text,
	"next_steps" text,
	"rules_checked" integer DEFAULT 0,
	"rules_passed" integer DEFAULT 0,
	"rules_failed" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_criteria" (
	"id" serial PRIMARY KEY NOT NULL,
	"criteria_type" varchar(100) NOT NULL,
	"criteria_value" text NOT NULL,
	"criteria_label" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_document_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_name" varchar(255) NOT NULL,
	"document_category" varchar(100),
	"deal_type" varchar(50) DEFAULT 'all' NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_field_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"field_id" integer NOT NULL,
	"response_value" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_label" varchar(255) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"field_options" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"applies_to_deal_types" text DEFAULT 'all' NOT NULL,
	"field_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"admin_user_id" integer NOT NULL,
	"note_text" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"notification_type" varchar(100) NOT NULL,
	"recipient_email" varchar(255) NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"status" varchar(50) DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_review_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_category" varchar(50) NOT NULL,
	"rule_description" text NOT NULL,
	"rule_priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_sponsors" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"sponsor_name" varchar(255) NOT NULL,
	"ownership_percent" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"setting_key" varchar(100) NOT NULL,
	"setting_value" text NOT NULL,
	"setting_description" text,
	"tenant_id" integer,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_form_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"form_template_id" integer NOT NULL,
	"submitted_by" integer,
	"submitted_by_email" varchar(255),
	"form_data" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" integer NOT NULL,
	"sender_id" integer,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_chat_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"last_read_at" timestamp DEFAULT '1970-01-01 00:00:00.000' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_chats" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"is_group" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"tenant_id" integer,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" varchar(50) NOT NULL,
	"permission_key" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"scope" varchar(50) DEFAULT 'all',
	"updated_at" timestamp DEFAULT now(),
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "template_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"field_key" varchar(100) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"page_number" integer NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"font_size" integer DEFAULT 12,
	"font_color" varchar(20) DEFAULT '#000000',
	"text_align" varchar(20) DEFAULT 'left',
	"signer_role" varchar(50),
	"is_required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"tab_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_onboarding_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"status" varchar(50) NOT NULL,
	"signature_data" text,
	"signed_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"full_name" varchar(255),
	"company_name" varchar(255),
	"phone" varchar(50),
	"title" varchar(255),
	"role" varchar(50) DEFAULT 'broker' NOT NULL,
	"roles" text[],
	"user_type" varchar(50) DEFAULT 'broker',
	"created_at" timestamp DEFAULT now(),
	"last_login_at" timestamp,
	"email_verified" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"password_reset_token" varchar(255),
	"password_reset_expires" timestamp,
	"onboarding_completed" boolean DEFAULT false,
	"partnership_agreement_signed_at" timestamp,
	"training_completed_at" timestamp,
	"lender_training_completed" boolean DEFAULT false,
	"is_test_user" boolean DEFAULT false,
	"google_id" varchar(255),
	"avatar_url" varchar(500),
	"google_refresh_token" text,
	"google_access_token" text,
	"google_token_expires_at" timestamp,
	"microsoft_id" varchar(255),
	"microsoft_refresh_token" text,
	"microsoft_access_token" text,
	"microsoft_token_expires_at" timestamp,
	"invite_token" varchar(255),
	"invite_token_expires" timestamp,
	"invited_by" integer,
	"invite_status" varchar(50) DEFAULT 'none',
	"invite_token_sent_at" timestamp,
	"broker_settings" jsonb,
	"broker_company_name" varchar(255),
	"broker_license_number" varchar(100),
	"broker_operating_states" text[],
	"broker_years_experience" integer,
	"broker_preferred_loan_types" text[],
	"email_consent" boolean DEFAULT false,
	"sms_consent" boolean DEFAULT false,
	"borrower_magic_link" varchar(255),
	"borrower_magic_link_enabled" boolean DEFAULT false,
	"broker_magic_link" varchar(255),
	"broker_magic_link_enabled" boolean DEFAULT false,
	"magic_link_token" varchar(255),
	"magic_link_expires" timestamp,
	"failed_login_attempts" integer DEFAULT 0,
	"account_locked_until" timestamp,
	"password_expires_at" timestamp,
	"token_version" integer DEFAULT 0 NOT NULL,
	"tenant_id" integer,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_borrower_magic_link_unique" UNIQUE("borrower_magic_link"),
	CONSTRAINT "users_broker_magic_link_unique" UNIQUE("broker_magic_link")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event_id" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status_code" smallint,
	"response_time_ms" integer,
	"error_message" text,
	"retried_at" timestamp[],
	"succeeded" boolean NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" varchar(2048) NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"secret" varchar(255) NOT NULL,
	"rate_limit_per_second" integer DEFAULT 10 NOT NULL,
	"retry_policy" jsonb DEFAULT '{"maxRetries":5,"backoffStrategy":"exponential"}'::jsonb NOT NULL,
	"headers" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_triggered_at" timestamp,
	"failure_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"resource_type" varchar(50) NOT NULL,
	"sample_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_step_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"key" varchar(100) NOT NULL,
	"description" text,
	"color" varchar(50) DEFAULT '#6366f1',
	"icon" varchar(50),
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "workflow_step_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "admin_activity" ADD CONSTRAINT "admin_activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_activity" ADD CONSTRAINT "admin_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_user_milestone_stage_id_project_stages_id_fk" FOREIGN KEY ("user_milestone_stage_id") REFERENCES "public"."project_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_user_milestone_task_id_project_tasks_id_fk" FOREIGN KEY ("user_milestone_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_document_id_project_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_communications" ADD CONSTRAINT "agent_communications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_communications" ADD CONSTRAINT "agent_communications_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_configurations" ADD CONSTRAINT "agent_configurations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_corrections" ADD CONSTRAINT "agent_corrections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_corrections" ADD CONSTRAINT "agent_corrections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_lender_decision_by_users_id_fk" FOREIGN KEY ("lender_decision_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_pipeline_runs" ADD CONSTRAINT "agent_pipeline_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_pipeline_runs" ADD CONSTRAINT "agent_pipeline_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_configuration_id_agent_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."agent_configurations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assistant_conversations" ADD CONSTRAINT "ai_assistant_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assistant_conversations" ADD CONSTRAINT "ai_assistant_conversations_deal_id_projects_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assistant_messages" ADD CONSTRAINT "ai_assistant_messages_conversation_id_ai_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_usage" ADD CONSTRAINT "api_key_usage_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borrower_documents" ADD CONSTRAINT "borrower_documents_borrower_profile_id_borrower_profiles_id_fk" FOREIGN KEY ("borrower_profile_id") REFERENCES "public"."borrower_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_contacts" ADD CONSTRAINT "broker_contacts_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_outreach_messages" ADD CONSTRAINT "broker_outreach_messages_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_outreach_messages" ADD CONSTRAINT "broker_outreach_messages_contact_id_broker_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."broker_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_form_config" ADD CONSTRAINT "commercial_form_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_submission_documents" ADD CONSTRAINT "commercial_submission_documents_submission_id_commercial_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."commercial_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_submissions" ADD CONSTRAINT "commercial_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_submissions" ADD CONSTRAINT "commercial_submissions_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_automation_nodes" ADD CONSTRAINT "comms_automation_nodes_automation_id_comms_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."comms_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_automation_runs" ADD CONSTRAINT "comms_automation_runs_automation_id_comms_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."comms_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_automations" ADD CONSTRAINT "comms_automations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_automations" ADD CONSTRAINT "comms_automations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_channels" ADD CONSTRAINT "comms_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_channels" ADD CONSTRAINT "comms_channels_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_consent_records" ADD CONSTRAINT "comms_consent_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_consent_records" ADD CONSTRAINT "comms_consent_records_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_opt_outs" ADD CONSTRAINT "comms_opt_outs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_opt_outs" ADD CONSTRAINT "comms_opt_outs_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_scheduled_executions" ADD CONSTRAINT "comms_scheduled_executions_run_id_comms_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."comms_automation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_scheduled_executions" ADD CONSTRAINT "comms_scheduled_executions_node_id_comms_automation_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."comms_automation_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_segments" ADD CONSTRAINT "comms_segments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_segments" ADD CONSTRAINT "comms_segments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_send_log" ADD CONSTRAINT "comms_send_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_send_log" ADD CONSTRAINT "comms_send_log_run_id_comms_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."comms_automation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_send_log" ADD CONSTRAINT "comms_send_log_node_id_comms_automation_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."comms_automation_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_send_log" ADD CONSTRAINT "comms_send_log_template_id_comms_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."comms_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_templates" ADD CONSTRAINT "comms_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms_templates" ADD CONSTRAINT "comms_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_policies" ADD CONSTRAINT "credit_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_document_files" ADD CONSTRAINT "deal_document_files_document_id_deal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."deal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_document_files" ADD CONSTRAINT "deal_document_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_deal_id_projects_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_stage_id_project_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."project_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_deal_property_id_deal_properties_id_fk" FOREIGN KEY ("deal_property_id") REFERENCES "public"."deal_properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_memory_entries" ADD CONSTRAINT "deal_memory_entries_deal_id_projects_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_memory_entries" ADD CONSTRAINT "deal_memory_entries_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_notes" ADD CONSTRAINT "deal_notes_deal_id_projects_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_notes" ADD CONSTRAINT "deal_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_processors" ADD CONSTRAINT "deal_processors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_processors" ADD CONSTRAINT "deal_processors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_processors" ADD CONSTRAINT "deal_processors_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_properties" ADD CONSTRAINT "deal_properties_deal_id_projects_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stories" ADD CONSTRAINT "deal_stories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_deal_id_projects_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_third_parties" ADD CONSTRAINT "deal_third_parties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_third_parties" ADD CONSTRAINT "deal_third_parties_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_agreement_id_documents_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_quote_id_saved_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."saved_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_history" ADD CONSTRAINT "digest_history_config_id_loan_digest_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."loan_digest_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_history" ADD CONSTRAINT "digest_history_recipient_id_loan_digest_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."loan_digest_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_history" ADD CONSTRAINT "digest_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_state" ADD CONSTRAINT "digest_state_config_id_loan_digest_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."loan_digest_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_state" ADD CONSTRAINT "digest_state_recipient_id_loan_digest_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."loan_digest_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_templates" ADD CONSTRAINT "digest_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_download_tokens" ADD CONSTRAINT "document_download_tokens_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_deal_document_id_deal_documents_id_fk" FOREIGN KEY ("deal_document_id") REFERENCES "public"."deal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_fields" ADD CONSTRAINT "document_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_fields" ADD CONSTRAINT "document_fields_signer_id_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_review_results" ADD CONSTRAINT "document_review_results_document_id_deal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."deal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_review_results" ADD CONSTRAINT "document_review_results_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_review_results" ADD CONSTRAINT "document_review_results_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_review_results" ADD CONSTRAINT "document_review_results_document_template_id_program_document_templates_id_fk" FOREIGN KEY ("document_template_id") REFERENCES "public"."program_document_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_review_results" ADD CONSTRAINT "document_review_results_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_review_rules" ADD CONSTRAINT "document_review_rules_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_review_rules" ADD CONSTRAINT "document_review_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_quote_id_saved_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."saved_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread_deal_links" ADD CONSTRAINT "email_thread_deal_links_email_thread_id_email_threads_id_fk" FOREIGN KEY ("email_thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread_deal_links" ADD CONSTRAINT "email_thread_deal_links_deal_id_projects_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread_deal_links" ADD CONSTRAINT "email_thread_deal_links_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_envelopes" ADD CONSTRAINT "esign_envelopes_quote_id_saved_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."saved_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_envelopes" ADD CONSTRAINT "esign_envelopes_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_envelopes" ADD CONSTRAINT "esign_envelopes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_envelopes" ADD CONSTRAINT "esign_envelopes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esign_events" ADD CONSTRAINT "esign_events_envelope_id_esign_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."esign_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_documents" ADD CONSTRAINT "fund_documents_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_knowledge_entries" ADD CONSTRAINT "fund_knowledge_entries_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funds" ADD CONSTRAINT "funds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_uploads" ADD CONSTRAINT "guideline_uploads_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_uploads" ADD CONSTRAINT "guideline_uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_sms_messages" ADD CONSTRAINT "inbound_sms_messages_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_sms_messages" ADD CONSTRAINT "inbound_sms_messages_broadcast_id_partner_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."partner_broadcasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_form_templates" ADD CONSTRAINT "inquiry_form_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_ai_analysis" ADD CONSTRAINT "intake_ai_analysis_deal_id_intake_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."intake_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deal_documents" ADD CONSTRAINT "intake_deal_documents_deal_id_intake_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."intake_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deal_documents" ADD CONSTRAINT "intake_deal_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deal_fund_submissions" ADD CONSTRAINT "intake_deal_fund_submissions_deal_id_intake_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."intake_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deal_fund_submissions" ADD CONSTRAINT "intake_deal_fund_submissions_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deal_fund_submissions" ADD CONSTRAINT "intake_deal_fund_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deal_status_history" ADD CONSTRAINT "intake_deal_status_history_deal_id_intake_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."intake_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deal_status_history" ADD CONSTRAINT "intake_deal_status_history_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deal_tasks" ADD CONSTRAINT "intake_deal_tasks_deal_id_intake_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."intake_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deal_tasks" ADD CONSTRAINT "intake_deal_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deals" ADD CONSTRAINT "intake_deals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deals" ADD CONSTRAINT "intake_deals_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_deals" ADD CONSTRAINT "intake_deals_linked_project_id_projects_id_fk" FOREIGN KEY ("linked_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_document_rules" ADD CONSTRAINT "intake_document_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_agent_customizations" ADD CONSTRAINT "lender_agent_customizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_review_config" ADD CONSTRAINT "lender_review_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_training_progress" ADD CONSTRAINT "lender_training_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_training_progress" ADD CONSTRAINT "lender_training_progress_step_id_lender_training_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."lender_training_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_training_steps" ADD CONSTRAINT "lender_training_steps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_digest_configs" ADD CONSTRAINT "loan_digest_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_digest_configs" ADD CONSTRAINT "loan_digest_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_digest_recipients" ADD CONSTRAINT "loan_digest_recipients_config_id_loan_digest_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."loan_digest_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_digest_recipients" ADD CONSTRAINT "loan_digest_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_programs" ADD CONSTRAINT "loan_programs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_programs" ADD CONSTRAINT "loan_programs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_updates" ADD CONSTRAINT "loan_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_updates" ADD CONSTRAINT "loan_updates_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread_participants" ADD CONSTRAINT "message_thread_participants_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread_participants" ADD CONSTRAINT "message_thread_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_deal_id_projects_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_broadcast_recipients" ADD CONSTRAINT "partner_broadcast_recipients_broadcast_id_partner_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."partner_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_broadcast_recipients" ADD CONSTRAINT "partner_broadcast_recipients_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_broadcasts" ADD CONSTRAINT "partner_broadcasts_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_agent_steps" ADD CONSTRAINT "pipeline_agent_steps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_step_logs" ADD CONSTRAINT "pipeline_step_logs_pipeline_run_id_agent_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."agent_pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_step_logs" ADD CONSTRAINT "pipeline_step_logs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_field_templates" ADD CONSTRAINT "pricing_field_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_field_templates" ADD CONSTRAINT "pricing_field_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_quote_logs" ADD CONSTRAINT "pricing_quote_logs_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_quote_logs" ADD CONSTRAINT "pricing_quote_logs_ruleset_id_pricing_rulesets_id_fk" FOREIGN KEY ("ruleset_id") REFERENCES "public"."pricing_rulesets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_quote_logs" ADD CONSTRAINT "pricing_quote_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_requests" ADD CONSTRAINT "pricing_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rulesets" ADD CONSTRAINT "pricing_rulesets_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rulesets" ADD CONSTRAINT "pricing_rulesets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processor_daily_queue" ADD CONSTRAINT "processor_daily_queue_processor_id_users_id_fk" FOREIGN KEY ("processor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processor_daily_queue" ADD CONSTRAINT "processor_daily_queue_deal_id_projects_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processor_daily_queue" ADD CONSTRAINT "processor_daily_queue_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_document_templates" ADD CONSTRAINT "program_document_templates_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_review_rules" ADD CONSTRAINT "program_review_rules_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_review_rules" ADD CONSTRAINT "program_review_rules_credit_policy_id_credit_policies_id_fk" FOREIGN KEY ("credit_policy_id") REFERENCES "public"."credit_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_review_rules" ADD CONSTRAINT "program_review_rules_document_template_id_program_document_templates_id_fk" FOREIGN KEY ("document_template_id") REFERENCES "public"."program_document_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_task_templates" ADD CONSTRAINT "program_task_templates_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_workflow_steps" ADD CONSTRAINT "program_workflow_steps_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_workflow_steps" ADD CONSTRAINT "program_workflow_steps_step_definition_id_workflow_step_definitions_id_fk" FOREIGN KEY ("step_definition_id") REFERENCES "public"."workflow_step_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_stage_id_project_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."project_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_pdf_templates" ADD CONSTRAINT "quote_pdf_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_proposals" ADD CONSTRAINT "rule_proposals_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_proposals" ADD CONSTRAINT "rule_proposals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_quotes" ADD CONSTRAINT "saved_quotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_quotes" ADD CONSTRAINT "saved_quotes_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_quotes" ADD CONSTRAINT "saved_quotes_program_id_loan_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loan_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_digest_drafts" ADD CONSTRAINT "scheduled_digest_drafts_config_id_loan_digest_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."loan_digest_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_digest_drafts" ADD CONSTRAINT "scheduled_digest_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_digest_drafts" ADD CONSTRAINT "scheduled_digest_drafts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signers" ADD CONSTRAINT "signers_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_ai_reviews" ADD CONSTRAINT "submission_ai_reviews_submission_id_commercial_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."commercial_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_field_responses" ADD CONSTRAINT "submission_field_responses_submission_id_commercial_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."commercial_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_field_responses" ADD CONSTRAINT "submission_field_responses_field_id_submission_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."submission_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_notes" ADD CONSTRAINT "submission_notes_submission_id_commercial_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."commercial_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_notes" ADD CONSTRAINT "submission_notes_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_notifications" ADD CONSTRAINT "submission_notifications_submission_id_commercial_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."commercial_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_sponsors" ADD CONSTRAINT "submission_sponsors_submission_id_commercial_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."commercial_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_form_submissions" ADD CONSTRAINT "task_form_submissions_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_form_submissions" ADD CONSTRAINT "task_form_submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_form_submissions" ADD CONSTRAINT "task_form_submissions_form_template_id_inquiry_form_templates_id_fk" FOREIGN KEY ("form_template_id") REFERENCES "public"."inquiry_form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_form_submissions" ADD CONSTRAINT "task_form_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_form_submissions" ADD CONSTRAINT "task_form_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_messages" ADD CONSTRAINT "team_chat_messages_chat_id_team_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."team_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_messages" ADD CONSTRAINT "team_chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_participants" ADD CONSTRAINT "team_chat_participants_chat_id_team_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."team_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_participants" ADD CONSTRAINT "team_chat_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chats" ADD CONSTRAINT "team_chats_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chats" ADD CONSTRAINT "team_chats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_permissions" ADD CONSTRAINT "team_permissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_fields" ADD CONSTRAINT "template_fields_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_progress" ADD CONSTRAINT "user_onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_progress" ADD CONSTRAINT "user_onboarding_progress_document_id_onboarding_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."onboarding_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_usage_key_id_idx" ON "api_key_usage" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "api_key_usage_timestamp_idx" ON "api_key_usage" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "api_keys_created_by_user_id_idx" ON "api_keys" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "login_attempts_email_ip_idx" ON "login_attempts" USING btree ("email","ip_address");--> statement-breakpoint
CREATE INDEX "login_attempts_timestamp_idx" ON "login_attempts" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "mtp_thread_user_unique" ON "message_thread_participants" USING btree ("thread_id","user_id");--> statement-breakpoint
CREATE INDEX "deliveries_webhook_id_idx" ON "webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "deliveries_event_id_idx" ON "webhook_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "deliveries_timestamp_idx" ON "webhook_deliveries" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "deliveries_succeeded_idx" ON "webhook_deliveries" USING btree ("succeeded");--> statement-breakpoint
CREATE INDEX "webhooks_user_id_idx" ON "webhooks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "webhooks_active_idx" ON "webhooks" USING btree ("active");