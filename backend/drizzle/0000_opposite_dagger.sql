CREATE TYPE "public"."sector" AS ENUM('FINANCIAL', 'STOCK', 'SUPPORT', 'SALES', 'HUMAN_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('CALM', 'NEUTRAL', 'ANGRY', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_name" text NOT NULL,
	"raw_content" text NOT NULL,
	"assigned_sector" "sector",
	"sentiment" "sentiment",
	"urgency_score" numeric(3, 2),
	"confidence_score" numeric(3, 2),
	"summary" text,
	"suggested_action" text,
	"corrected_sector" "sector",
	"status" "message_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
