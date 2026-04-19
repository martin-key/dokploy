import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
	SECRET_PROVIDER_NAME_ERROR,
	SECRET_PROVIDER_NAME_REGEX,
	SECRET_PROVIDER_TYPES,
} from "../validations/secret-provider";
import { organization } from "./account";

export const secretProviders = pgTable("secret_provider", {
	secretProviderId: text("secretProviderId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	providerType: text("providerType", { enum: SECRET_PROVIDER_TYPES })
		.notNull()
		.default("vault"),

	// HashiCorp Vault config
	vaultAddress: text("vaultAddress"),
	vaultToken: text("vaultToken"),
	vaultNamespace: text("vaultNamespace"),
	vaultMountPath: text("vaultMountPath"),

	// AWS Secrets Manager config
	awsAccessKeyId: text("awsAccessKeyId"),
	awsSecretAccessKey: text("awsSecretAccessKey"),
	awsRegion: text("awsRegion"),
	awsEndpoint: text("awsEndpoint"),

	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const secretProvidersRelations = relations(
	secretProviders,
	({ one }) => ({
		organization: one(organization, {
			fields: [secretProviders.organizationId],
			references: [organization.id],
		}),
	}),
);

const createSchema = createInsertSchema(secretProviders, {
	secretProviderId: z.string(),
	name: z
		.string()
		.min(1)
		.regex(SECRET_PROVIDER_NAME_REGEX, SECRET_PROVIDER_NAME_ERROR),
	providerType: z.enum(SECRET_PROVIDER_TYPES),
	vaultAddress: z.string().url().optional().nullable(),
	vaultToken: z.string().optional().nullable(),
	vaultNamespace: z.string().optional().nullable(),
	vaultMountPath: z.string().optional().nullable(),
	awsAccessKeyId: z.string().optional().nullable(),
	awsSecretAccessKey: z.string().optional().nullable(),
	awsRegion: z.string().optional().nullable(),
	awsEndpoint: z.string().optional().nullable(),
});

const providerSpecificRefinement = (
	data: {
		providerType?: (typeof SECRET_PROVIDER_TYPES)[number];
		vaultAddress?: string | null;
		vaultToken?: string | null;
		awsAccessKeyId?: string | null;
		awsSecretAccessKey?: string | null;
		awsRegion?: string | null;
	},
	ctx: z.RefinementCtx,
) => {
	if (data.providerType === "vault") {
		if (!data.vaultAddress) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["vaultAddress"],
				message: "Vault address is required",
			});
		}
		if (!data.vaultToken) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["vaultToken"],
				message: "Vault token is required",
			});
		}
	}
	if (data.providerType === "aws-secrets") {
		if (!data.awsAccessKeyId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["awsAccessKeyId"],
				message: "AWS Access Key ID is required",
			});
		}
		if (!data.awsSecretAccessKey) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["awsSecretAccessKey"],
				message: "AWS Secret Access Key is required",
			});
		}
		if (!data.awsRegion) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["awsRegion"],
				message: "AWS Region is required",
			});
		}
	}
};

export const apiCreateSecretProvider = createSchema
	.pick({
		name: true,
		providerType: true,
		vaultAddress: true,
		vaultToken: true,
		vaultNamespace: true,
		vaultMountPath: true,
		awsAccessKeyId: true,
		awsSecretAccessKey: true,
		awsRegion: true,
		awsEndpoint: true,
	})
	.superRefine(providerSpecificRefinement);

export const apiFindOneSecretProvider = z.object({
	secretProviderId: z.string().min(1),
});

export const apiRemoveSecretProvider = z.object({
	secretProviderId: z.string().min(1),
});

export const apiUpdateSecretProvider = createSchema
	.pick({
		name: true,
		providerType: true,
		vaultAddress: true,
		vaultToken: true,
		vaultNamespace: true,
		vaultMountPath: true,
		awsAccessKeyId: true,
		awsSecretAccessKey: true,
		awsRegion: true,
		awsEndpoint: true,
	})
	.extend({
		secretProviderId: z.string().min(1),
	})
	.superRefine(providerSpecificRefinement);

export const apiTestSecretProvider = apiCreateSecretProvider;
