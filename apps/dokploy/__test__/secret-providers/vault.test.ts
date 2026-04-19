import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	fetchVaultSecret,
	testVaultConnection,
} from "@dokploy/server/utils/secret-providers/vault";

const baseProvider = {
	secretProviderId: "sp_1",
	name: "v",
	providerType: "vault" as const,
	vaultAddress: "https://vault.test",
	vaultToken: "hvs.TOKEN",
	vaultNamespace: null,
	vaultMountPath: null,
	awsAccessKeyId: null,
	awsSecretAccessKey: null,
	awsRegion: null,
	awsEndpoint: null,
	organizationId: "org_1",
	createdAt: new Date(),
};

const mockOk = (body: unknown) =>
	Promise.resolve({
		ok: true,
		status: 200,
		statusText: "OK",
		text: () => Promise.resolve(JSON.stringify(body)),
		json: () => Promise.resolve(body),
	} as unknown as Response);

const mockFail = (status: number, body = "nope") =>
	Promise.resolve({
		ok: false,
		status,
		statusText: "Error",
		text: () => Promise.resolve(body),
		json: () => Promise.resolve({}),
	} as unknown as Response);

describe("fetchVaultSecret", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("fetches from the default mount (secret) and returns JSON when no key given", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ data: { data: { apiKey: "k1", other: "v" } } }),
		);

		const result = await fetchVaultSecret(baseProvider, "app/config");
		const parsed = JSON.parse(result);
		expect(parsed).toEqual({ apiKey: "k1", other: "v" });

		const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[0]).toBe("https://vault.test/v1/secret/data/app/config");
		expect(call[1].headers["X-Vault-Token"]).toBe("hvs.TOKEN");
		expect(call[1].headers["X-Vault-Namespace"]).toBeUndefined();
	});

	it("uses the configured mount and namespace when present", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ data: { data: { apiKey: "k1" } } }),
		);

		await fetchVaultSecret(
			{
				...baseProvider,
				vaultMountPath: "custom/",
				vaultNamespace: "admin/team-a",
			},
			"app/config",
			"apiKey",
		);

		const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[0]).toBe("https://vault.test/v1/custom/data/app/config");
		expect(call[1].headers["X-Vault-Namespace"]).toBe("admin/team-a");
	});

	it("returns the specific field when a key is provided", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ data: { data: { apiKey: "k1", other: "v" } } }),
		);
		const result = await fetchVaultSecret(baseProvider, "app/config", "apiKey");
		expect(result).toBe("k1");
	});

	it("throws NOT_FOUND when the key is missing", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ data: { data: { other: "v" } } }),
		);
		await expect(
			fetchVaultSecret(baseProvider, "app/config", "apiKey"),
		).rejects.toThrow(/no field "apiKey"/);
	});

	it("throws BAD_REQUEST when Vault responds with a non-2xx status", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockFail(403, "forbidden"),
		);
		await expect(fetchVaultSecret(baseProvider, "app/config")).rejects.toThrow(
			/Vault request failed \(403\)/,
		);
	});

	it("requires address and token", async () => {
		await expect(
			fetchVaultSecret({ ...baseProvider, vaultAddress: null }, "x"),
		).rejects.toThrow(/address or token/);
		await expect(
			fetchVaultSecret({ ...baseProvider, vaultToken: null }, "x"),
		).rejects.toThrow(/address or token/);
	});
});

describe("testVaultConnection", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("succeeds when lookup-self returns 2xx", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ data: { id: "token-id" } }),
		);
		await expect(
			testVaultConnection({
				vaultAddress: "https://vault.test",
				vaultToken: "hvs.TOKEN",
			}),
		).resolves.toBeUndefined();
		const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[0]).toBe("https://vault.test/v1/auth/token/lookup-self");
	});

	it("fails loudly when the credentials are rejected", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockFail(403, "permission denied"),
		);
		await expect(
			testVaultConnection({
				vaultAddress: "https://vault.test",
				vaultToken: "hvs.TOKEN",
			}),
		).rejects.toThrow(/Vault connection failed \(403\)/);
	});

	it("validates required inputs", async () => {
		await expect(
			testVaultConnection({ vaultAddress: null, vaultToken: "x" }),
		).rejects.toThrow(/address and token are required/i);
	});
});
