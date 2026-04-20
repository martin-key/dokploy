import { db } from "@dokploy/server/db";
import {
	type apiCreateSecretProvider,
	secretProviders,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";

export type SecretProvider = typeof secretProviders.$inferSelect;

export const createSecretProvider = async (
	input: z.infer<typeof apiCreateSecretProvider>,
	organizationId: string,
) => {
	const newSecretProvider = await db
		.insert(secretProviders)
		.values({
			...input,
			organizationId,
		})
		.returning()
		.then((value) => value[0]);

	if (!newSecretProvider) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting secret provider",
		});
	}

	return newSecretProvider;
};

export const findSecretProviderById = async (secretProviderId: string) => {
	const secretProvider = await db.query.secretProviders.findFirst({
		where: eq(secretProviders.secretProviderId, secretProviderId),
	});
	if (!secretProvider) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Secret provider not found",
		});
	}
	return secretProvider;
};

export const findSecretProviderByName = async (
	name: string,
	organizationId: string,
) => {
	return await db.query.secretProviders.findFirst({
		where: and(
			eq(secretProviders.name, name),
			eq(secretProviders.organizationId, organizationId),
		),
	});
};

export const removeSecretProviderById = async (
	secretProviderId: string,
	organizationId: string,
) => {
	const result = await db
		.delete(secretProviders)
		.where(
			and(
				eq(secretProviders.secretProviderId, secretProviderId),
				eq(secretProviders.organizationId, organizationId),
			),
		)
		.returning();

	return result[0];
};

export const updateSecretProviderById = async (
	secretProviderId: string,
	secretProviderData: Partial<SecretProvider>,
	organizationId: string,
) => {
	const result = await db
		.update(secretProviders)
		.set({
			...secretProviderData,
		})
		.where(
			and(
				eq(secretProviders.secretProviderId, secretProviderId),
				eq(secretProviders.organizationId, organizationId),
			),
		)
		.returning();

	return result[0];
};
