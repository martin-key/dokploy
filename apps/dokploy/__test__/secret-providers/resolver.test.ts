import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/secret-providers/vault", () => ({
	fetchVaultSecret: vi.fn(),
	testVaultConnection: vi.fn(),
}));

vi.mock("@dokploy/server/utils/secret-providers/aws-secrets", () => ({
	fetchAwsSecret: vi.fn(),
	testAwsSecretsConnection: vi.fn(),
}));

import { fetchAwsSecret } from "@dokploy/server/utils/secret-providers/aws-secrets";
import {
	hasSecretReferences,
	resolveSecretReferences,
} from "@dokploy/server/utils/secret-providers/resolver";
import { fetchVaultSecret } from "@dokploy/server/utils/secret-providers/vault";

const mockedVault = vi.mocked(fetchVaultSecret);
const mockedAws = vi.mocked(fetchAwsSecret);

const vaultProvider = {
	secretProviderId: "sp_vault",
	name: "prod-vault",
	providerType: "vault" as const,
	vaultAddress: "https://vault.test",
	vaultToken: "hvs.TOKEN",
	vaultNamespace: null,
	vaultMountPath: "secret",
	awsAccessKeyId: null,
	awsSecretAccessKey: null,
	awsRegion: null,
	awsEndpoint: null,
	organizationId: "org_1",
	createdAt: new Date(),
};

const awsProvider = {
	...vaultProvider,
	secretProviderId: "sp_aws",
	name: "aws-prod",
	providerType: "aws-secrets" as const,
	vaultAddress: null,
	vaultToken: null,
	vaultMountPath: null,
	awsAccessKeyId: "AKIA",
	awsSecretAccessKey: "SECRET",
	awsRegion: "us-east-1",
};

describe("hasSecretReferences", () => {
	it("returns true for strings containing a reference", () => {
		expect(hasSecretReferences("PASSWORD={{secret.v.x}}")).toBe(true);
	});

	it("returns false for literal strings", () => {
		expect(hasSecretReferences("PASSWORD=literal")).toBe(false);
		expect(hasSecretReferences("")).toBe(false);
		expect(hasSecretReferences(null)).toBe(false);
		expect(hasSecretReferences(undefined)).toBe(false);
	});
});

describe("resolveSecretReferences", () => {
	beforeEach(() => {
		mockedVault.mockReset();
		mockedAws.mockReset();
	});

	it("returns the input unchanged when there are no references", async () => {
		const input = "PLAIN=value";
		const loader = vi.fn();
		expect(await resolveSecretReferences(input, loader)).toBe(input);
		expect(loader).not.toHaveBeenCalled();
	});

	it("resolves a single vault reference", async () => {
		const loader = vi.fn().mockResolvedValue(vaultProvider);
		mockedVault.mockResolvedValue("s3cret-value");

		const result = await resolveSecretReferences(
			"DB_PASSWORD={{secret.prod-vault.app/db}}",
			loader,
		);

		expect(result).toBe("DB_PASSWORD=s3cret-value");
		expect(loader).toHaveBeenCalledWith("prod-vault");
		expect(mockedVault).toHaveBeenCalledWith(
			vaultProvider,
			"app/db",
			undefined,
		);
	});

	it("passes the optional #key to the provider fetcher", async () => {
		const loader = vi.fn().mockResolvedValue(awsProvider);
		mockedAws.mockResolvedValue("my-api-key");

		const result = await resolveSecretReferences(
			"API_KEY={{secret.aws-prod.creds#apiKey}}",
			loader,
		);

		expect(result).toBe("API_KEY=my-api-key");
		expect(mockedAws).toHaveBeenCalledWith(awsProvider, "creds", "apiKey");
	});

	it("caches providers and values across repeated references", async () => {
		const loader = vi.fn().mockResolvedValue(vaultProvider);
		mockedVault.mockResolvedValue("same-value");

		const result = await resolveSecretReferences(
			[
				"A={{secret.prod-vault.shared}}",
				"B={{secret.prod-vault.shared}}",
				"C={{secret.prod-vault.shared#field}}",
			].join("\n"),
			loader,
		);

		expect(result).toBe("A=same-value\nB=same-value\nC=same-value");
		expect(loader).toHaveBeenCalledTimes(1);
		// Called once for shared (no key) and once for shared#field.
		expect(mockedVault).toHaveBeenCalledTimes(2);
	});

	it("throws NOT_FOUND when the provider loader returns undefined", async () => {
		const loader = vi.fn().mockResolvedValue(undefined);
		await expect(
			resolveSecretReferences("X={{secret.missing.path}}", loader),
		).rejects.toThrow(/Secret provider "missing" not found/);
	});

	it("surfaces errors raised by the provider fetcher", async () => {
		const loader = vi.fn().mockResolvedValue(vaultProvider);
		mockedVault.mockRejectedValue(new Error("boom"));
		await expect(
			resolveSecretReferences("X={{secret.prod-vault.x}}", loader),
		).rejects.toThrow("boom");
	});

	it("rejects unsupported provider types", async () => {
		const loader = vi.fn().mockResolvedValue({
			...vaultProvider,
			providerType: "doppler" as unknown as "vault",
		});
		await expect(
			resolveSecretReferences("X={{secret.prod-vault.x}}", loader),
		).rejects.toThrow(/Unsupported secret provider type/);
	});
});
