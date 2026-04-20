import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	fetchAwsSecret,
	testAwsSecretsConnection,
} from "@dokploy/server/utils/secret-providers/aws-secrets";

const awsProvider = {
	secretProviderId: "sp_aws",
	name: "aws",
	providerType: "aws-secrets" as const,
	vaultAddress: null,
	vaultToken: null,
	vaultNamespace: null,
	vaultMountPath: null,
	awsAccessKeyId: "AKIA",
	awsSecretAccessKey: "SECRET",
	awsRegion: "us-east-1",
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

describe("fetchAwsSecret", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("POSTs to the regional SecretsManager endpoint with a signed request", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ SecretString: "raw-value" }),
		);

		const result = await fetchAwsSecret(awsProvider, "prod/db");
		expect(result).toBe("raw-value");

		const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[0]).toBe("https://secretsmanager.us-east-1.amazonaws.com");
		expect(call[1].method).toBe("POST");
		expect(call[1].headers["X-Amz-Target"]).toBe(
			"secretsmanager.GetSecretValue",
		);
		expect(call[1].headers.Authorization).toMatch(
			/^AWS4-HMAC-SHA256 Credential=AKIA\//,
		);
		expect(JSON.parse(call[1].body)).toEqual({ SecretId: "prod/db" });
	});

	it("uses a custom endpoint when configured (LocalStack)", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ SecretString: "v" }),
		);
		await fetchAwsSecret(
			{ ...awsProvider, awsEndpoint: "http://localhost:4566/" },
			"x",
		);
		const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[0]).toBe("http://localhost:4566");
	});

	it("parses JSON SecretString and returns the requested key", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ SecretString: JSON.stringify({ user: "u", pass: "p" }) }),
		);
		const result = await fetchAwsSecret(awsProvider, "creds", "pass");
		expect(result).toBe("p");
	});

	it("throws NOT_FOUND when the requested key is missing", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ SecretString: JSON.stringify({ user: "u" }) }),
		);
		await expect(fetchAwsSecret(awsProvider, "creds", "pass")).rejects.toThrow(
			/no field "pass"/,
		);
	});

	it("throws BAD_REQUEST when SecretString is not JSON but a key was requested", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ SecretString: "not-json" }),
		);
		await expect(fetchAwsSecret(awsProvider, "creds", "key")).rejects.toThrow(
			/not valid JSON/,
		);
	});

	it("propagates AWS error responses", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockFail(400, "AccessDenied"),
		);
		await expect(fetchAwsSecret(awsProvider, "x")).rejects.toThrow(
			/AWS Secrets Manager request failed \(400\)/,
		);
	});

	it("requires access key, secret key and region", async () => {
		await expect(
			fetchAwsSecret({ ...awsProvider, awsAccessKeyId: null }, "x"),
		).rejects.toThrow(/missing credentials/);
		await expect(
			fetchAwsSecret({ ...awsProvider, awsRegion: null }, "x"),
		).rejects.toThrow(/missing credentials/);
	});
});

describe("testAwsSecretsConnection", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("calls ListSecrets with MaxResults=1", async () => {
		(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
			mockOk({ SecretList: [] }),
		);
		await testAwsSecretsConnection({
			awsAccessKeyId: "AKIA",
			awsSecretAccessKey: "SECRET",
			awsRegion: "us-east-1",
		});
		const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[1].headers["X-Amz-Target"]).toBe("secretsmanager.ListSecrets");
		expect(JSON.parse(call[1].body)).toEqual({ MaxResults: 1 });
	});

	it("requires credentials and region", async () => {
		await expect(
			testAwsSecretsConnection({
				awsAccessKeyId: null,
				awsSecretAccessKey: "x",
				awsRegion: "us-east-1",
			}),
		).rejects.toThrow(/required/);
	});
});
