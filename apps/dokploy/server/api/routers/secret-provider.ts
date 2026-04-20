import {
	createSecretProvider,
	findSecretProviderById,
	findSecretProviderByName,
	removeSecretProviderById,
	testAwsSecretsConnection,
	testVaultConnection,
	updateSecretProviderById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { createTRPCRouter, withPermission } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateSecretProvider,
	apiFindOneSecretProvider,
	apiRemoveSecretProvider,
	apiTestSecretProvider,
	apiUpdateSecretProvider,
	secretProviders,
} from "@/server/db/schema";

const stripSecrets = <T extends Record<string, unknown>>(
	provider: T,
): Omit<T, "vaultToken" | "awsSecretAccessKey"> & {
	vaultToken: null;
	awsSecretAccessKey: null;
} => ({
	...provider,
	vaultToken: null,
	awsSecretAccessKey: null,
});

export const secretProviderRouter = createTRPCRouter({
	create: withPermission("secretProvider", "create")
		.input(apiCreateSecretProvider)
		.mutation(async ({ input, ctx }) => {
			const existing = await findSecretProviderByName(
				input.name,
				ctx.session.activeOrganizationId,
			);
			if (existing) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `A secret provider named "${input.name}" already exists`,
				});
			}

			try {
				const result = await createSecretProvider(
					input,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "secretProvider",
					resourceId: result.secretProviderId,
					resourceName: input.name,
				});
				return stripSecrets(result);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the secret provider",
					cause: error,
				});
			}
		}),
	testConnection: withPermission("secretProvider", "create")
		.input(apiTestSecretProvider)
		.mutation(async ({ input }) => {
			try {
				if (input.providerType === "vault") {
					await testVaultConnection(input);
				} else if (input.providerType === "aws-secrets") {
					await testAwsSecretsConnection(input);
				}
				return { ok: true };
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error connecting to secret provider",
					cause: error,
				});
			}
		}),
	one: withPermission("secretProvider", "read")
		.input(apiFindOneSecretProvider)
		.query(async ({ input, ctx }) => {
			const secretProvider = await findSecretProviderById(
				input.secretProviderId,
			);
			if (secretProvider.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this secret provider",
				});
			}
			return stripSecrets(secretProvider);
		}),
	all: withPermission("secretProvider", "read").query(async ({ ctx }) => {
		const rows = await db.query.secretProviders.findMany({
			where: eq(
				secretProviders.organizationId,
				ctx.session.activeOrganizationId,
			),
			orderBy: [desc(secretProviders.createdAt)],
		});
		return rows.map(stripSecrets);
	}),
	remove: withPermission("secretProvider", "delete")
		.input(apiRemoveSecretProvider)
		.mutation(async ({ input, ctx }) => {
			const secretProvider = await findSecretProviderById(
				input.secretProviderId,
			);

			if (secretProvider.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this secret provider",
				});
			}
			const result = await removeSecretProviderById(
				input.secretProviderId,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "secretProvider",
				resourceId: input.secretProviderId,
				resourceName: secretProvider.name,
			});
			return result ? stripSecrets(result) : null;
		}),
	update: withPermission("secretProvider", "update")
		.input(apiUpdateSecretProvider)
		.mutation(async ({ input, ctx }) => {
			try {
				const secretProvider = await findSecretProviderById(
					input.secretProviderId,
				);
				if (
					secretProvider.organizationId !== ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to update this secret provider",
					});
				}

				// Don't overwrite stored credentials when the client sends an empty
				// string — that means "unchanged" from the UI.
				const updateData: Record<string, unknown> = { ...input };
				if (!updateData.vaultToken) delete updateData.vaultToken;
				if (!updateData.awsSecretAccessKey)
					delete updateData.awsSecretAccessKey;

				const result = await updateSecretProviderById(
					input.secretProviderId,
					updateData,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "update",
					resourceType: "secretProvider",
					resourceId: input.secretProviderId,
					resourceName: input.name,
				});
				return result ? stripSecrets(result) : null;
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error updating the secret provider",
					cause: error,
				});
			}
		}),
});
