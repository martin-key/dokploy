import { describe, expect, it } from "vitest";
import {
	SECRET_PROVIDER_NAME_ERROR,
	SECRET_PROVIDER_NAME_REGEX,
	SECRET_REFERENCE_REGEX,
	SECRET_PROVIDER_TYPES,
} from "@dokploy/server/db/validations/secret-provider";

describe("SECRET_PROVIDER_NAME_REGEX", () => {
	it("accepts letters, digits, dashes and underscores", () => {
		expect(SECRET_PROVIDER_NAME_REGEX.test("prod-vault")).toBe(true);
		expect(SECRET_PROVIDER_NAME_REGEX.test("aws_secrets_1")).toBe(true);
		expect(SECRET_PROVIDER_NAME_REGEX.test("ABC123")).toBe(true);
	});

	it("rejects spaces and special characters", () => {
		expect(SECRET_PROVIDER_NAME_REGEX.test("prod vault")).toBe(false);
		expect(SECRET_PROVIDER_NAME_REGEX.test("prod.vault")).toBe(false);
		expect(SECRET_PROVIDER_NAME_REGEX.test("prod/vault")).toBe(false);
		expect(SECRET_PROVIDER_NAME_REGEX.test("")).toBe(false);
	});

	it("exposes a human-readable error message", () => {
		expect(SECRET_PROVIDER_NAME_ERROR).toMatch(/letters/i);
	});
});

describe("SECRET_REFERENCE_REGEX", () => {
	const matches = (input: string) => {
		SECRET_REFERENCE_REGEX.lastIndex = 0;
		return Array.from(input.matchAll(SECRET_REFERENCE_REGEX)).map((m) => ({
			providerName: m[1],
			secretPath: m[2],
			key: m[3],
		}));
	};

	it("extracts provider name and path from a simple reference", () => {
		expect(matches("DATABASE_URL={{secret.prod-vault.app/db}}")).toEqual([
			{
				providerName: "prod-vault",
				secretPath: "app/db",
				key: undefined,
			},
		]);
	});

	it("captures a key when the #<key> suffix is used", () => {
		expect(matches("API_KEY={{secret.aws.my/secret#apiKey}}")).toEqual([
			{ providerName: "aws", secretPath: "my/secret", key: "apiKey" },
		]);
	});

	it("tolerates surrounding whitespace inside the braces", () => {
		expect(matches("VAL={{ secret.v1.path }}")).toEqual([
			{ providerName: "v1", secretPath: "path", key: undefined },
		]);
	});

	it("finds multiple references in one string", () => {
		const extracted = matches(
			"A={{secret.v.a}}\nB={{secret.v.b#field}}\nC=literal",
		);
		expect(extracted).toHaveLength(2);
		expect(extracted[0]).toMatchObject({ providerName: "v", secretPath: "a" });
		expect(extracted[1]).toMatchObject({
			providerName: "v",
			secretPath: "b",
			key: "field",
		});
	});

	it("does not match malformed references", () => {
		expect(matches("X={{ secret.onlyOneSegment }}")).toHaveLength(0);
		expect(matches("X={{ secrets.v.a }}")).toHaveLength(0);
		expect(matches("X={{secret..empty}}")).toHaveLength(0);
	});
});

describe("SECRET_PROVIDER_TYPES", () => {
	it("lists exactly the MVP providers", () => {
		expect(SECRET_PROVIDER_TYPES).toEqual(["vault", "aws-secrets"]);
	});
});
