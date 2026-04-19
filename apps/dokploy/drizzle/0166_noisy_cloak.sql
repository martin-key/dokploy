CREATE TABLE "secret_provider" (
	"secretProviderId" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"providerType" text DEFAULT 'vault' NOT NULL,
	"vaultAddress" text,
	"vaultToken" text,
	"vaultNamespace" text,
	"vaultMountPath" text,
	"awsAccessKeyId" text,
	"awsSecretAccessKey" text,
	"awsRegion" text,
	"awsEndpoint" text,
	"organizationId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "secret_provider" ADD CONSTRAINT "secret_provider_organizationId_organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;