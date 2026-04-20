import type { SecretProvider } from "@dokploy/server/services/secret-provider";
import { TRPCError } from "@trpc/server";

interface VaultKvResponse {
	data?: {
		data?: Record<string, unknown>;
	};
	errors?: string[];
}

/**
 * Fetches a secret from HashiCorp Vault using the KV v2 engine.
 *
 * `secretPath` is the logical path inside the mount (e.g. "app/database").
 * `mountPath` defaults to "secret" if not configured on the provider.
 * If `key` is provided, returns the specific field; otherwise returns the
 * full data object serialized as JSON.
 */
export const fetchVaultSecret = async (
	provider: SecretProvider,
	secretPath: string,
	key?: string,
): Promise<string> => {
	if (!provider.vaultAddress || !provider.vaultToken) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Vault provider is missing address or token",
		});
	}

	const mount = (provider.vaultMountPath || "secret").replace(/^\/|\/$/g, "");
	const normalizedPath = secretPath.replace(/^\//, "");
	const baseUrl = provider.vaultAddress.replace(/\/$/, "");
	const url = `${baseUrl}/v1/${mount}/data/${normalizedPath}`;

	const headers: Record<string, string> = {
		"X-Vault-Token": provider.vaultToken,
	};
	if (provider.vaultNamespace) {
		headers["X-Vault-Namespace"] = provider.vaultNamespace;
	}

	const response = await fetch(url, { headers });
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Vault request failed (${response.status}): ${body || response.statusText}`,
		});
	}

	const payload = (await response.json()) as VaultKvResponse;
	const data = payload?.data?.data;
	if (!data || typeof data !== "object") {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Vault secret "${secretPath}" is empty or malformed`,
		});
	}

	if (key) {
		const value = data[key];
		if (value === undefined) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Vault secret "${secretPath}" has no field "${key}"`,
			});
		}
		return typeof value === "string" ? value : JSON.stringify(value);
	}

	return JSON.stringify(data);
};

export const testVaultConnection = async (provider: {
	vaultAddress?: string | null;
	vaultToken?: string | null;
	vaultNamespace?: string | null;
}) => {
	if (!provider.vaultAddress || !provider.vaultToken) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Vault address and token are required",
		});
	}
	const baseUrl = provider.vaultAddress.replace(/\/$/, "");
	const headers: Record<string, string> = {
		"X-Vault-Token": provider.vaultToken,
	};
	if (provider.vaultNamespace) {
		headers["X-Vault-Namespace"] = provider.vaultNamespace;
	}
	const response = await fetch(`${baseUrl}/v1/auth/token/lookup-self`, {
		headers,
	});
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Vault connection failed (${response.status}): ${body || response.statusText}`,
		});
	}
};
