import { SECRET_REFERENCE_REGEX } from "@dokploy/server/db/validations/secret-provider";
import type { SecretProvider } from "@dokploy/server/services/secret-provider";
import { TRPCError } from "@trpc/server";
import { fetchAwsSecret } from "./aws-secrets";
import { fetchVaultSecret } from "./vault";

type SecretProviderLoader = (
	name: string,
) => Promise<SecretProvider | undefined>;

/**
 * Fetches a secret value from the given provider. Optional `key` selects
 * a specific field from a JSON secret document.
 */
export const fetchProviderSecret = async (
	provider: SecretProvider,
	secretPath: string,
	key?: string,
): Promise<string> => {
	if (provider.providerType === "vault") {
		return fetchVaultSecret(provider, secretPath, key);
	}
	if (provider.providerType === "aws-secrets") {
		return fetchAwsSecret(provider, secretPath, key);
	}
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: `Unsupported secret provider type: ${provider.providerType}`,
	});
};

/**
 * Replaces all `{{secret.<providerName>.<path>[#<key>]}}` tokens in the
 * given string with resolved secret values.
 *
 * The `loadProvider` callback is responsible for looking up providers by
 * name within the correct organization scope.
 */
export const resolveSecretReferences = async (
	input: string,
	loadProvider: SecretProviderLoader,
): Promise<string> => {
	if (!input || !input.includes("{{")) {
		return input;
	}

	const providerCache = new Map<string, SecretProvider>();
	const valueCache = new Map<string, string>();
	const matches = Array.from(input.matchAll(SECRET_REFERENCE_REGEX));

	let result = input;
	for (const match of matches) {
		const [fullMatch, providerName, secretPath, key] = match;
		if (!providerName || !secretPath) continue;

		const cacheKey = `${providerName}::${secretPath}::${key ?? ""}`;
		let value = valueCache.get(cacheKey);

		if (value === undefined) {
			let provider = providerCache.get(providerName);
			if (!provider) {
				const loaded = await loadProvider(providerName);
				if (!loaded) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Secret provider "${providerName}" not found`,
					});
				}
				provider = loaded;
				providerCache.set(providerName, provider);
			}
			value = await fetchProviderSecret(provider, secretPath, key);
			valueCache.set(cacheKey, value);
		}

		result = result.split(fullMatch).join(value);
	}

	return result;
};

export const hasSecretReferences = (input: string | null | undefined) => {
	if (!input) return false;
	SECRET_REFERENCE_REGEX.lastIndex = 0;
	return SECRET_REFERENCE_REGEX.test(input);
};
