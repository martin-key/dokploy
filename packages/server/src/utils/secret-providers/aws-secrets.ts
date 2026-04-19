import { createHash, createHmac } from "node:crypto";
import type { SecretProvider } from "@dokploy/server/services/secret-provider";
import { TRPCError } from "@trpc/server";

/**
 * Minimal AWS SigV4 signer for the Secrets Manager `GetSecretValue` and
 * `ListSecrets` actions. Avoids pulling in the full aws-sdk dependency.
 */

const SERVICE = "secretsmanager";
const ALGORITHM = "AWS4-HMAC-SHA256";

const hmac = (key: Buffer | string, data: string) =>
	createHmac("sha256", key).update(data, "utf8").digest();

const sha256Hex = (data: string) =>
	createHash("sha256").update(data, "utf8").digest("hex");

const getSignatureKey = (
	secretKey: string,
	dateStamp: string,
	region: string,
) => {
	const kDate = hmac(`AWS4${secretKey}`, dateStamp);
	const kRegion = hmac(kDate, region);
	const kService = hmac(kRegion, SERVICE);
	return hmac(kService, "aws4_request");
};

const formatAmzDate = (date: Date) => {
	const y = date.getUTCFullYear().toString();
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	const hh = String(date.getUTCHours()).padStart(2, "0");
	const mm = String(date.getUTCMinutes()).padStart(2, "0");
	const ss = String(date.getUTCSeconds()).padStart(2, "0");
	return {
		amzDate: `${y}${m}${d}T${hh}${mm}${ss}Z`,
		dateStamp: `${y}${m}${d}`,
	};
};

interface AwsCallOptions {
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	endpoint?: string | null;
	action: string;
	body: Record<string, unknown>;
}

const callAwsSecretsManager = async <T = unknown>(
	opts: AwsCallOptions,
): Promise<T> => {
	const { accessKeyId, secretAccessKey, region, endpoint, action, body } = opts;
	const host = endpoint
		? endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "")
		: `${SERVICE}.${region}.amazonaws.com`;
	const url = endpoint ? endpoint.replace(/\/$/, "") : `https://${host}`;

	const { amzDate, dateStamp } = formatAmzDate(new Date());
	const payload = JSON.stringify(body);
	const payloadHash = sha256Hex(payload);

	const canonicalHeaders =
		"content-type:application/x-amz-json-1.1\n" +
		`host:${host}\n` +
		`x-amz-date:${amzDate}\n` +
		`x-amz-target:secretsmanager.${action}\n`;
	const signedHeaders = "content-type;host;x-amz-date;x-amz-target";

	const canonicalRequest = [
		"POST",
		"/",
		"",
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join("\n");

	const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
	const stringToSign = [
		ALGORITHM,
		amzDate,
		credentialScope,
		sha256Hex(canonicalRequest),
	].join("\n");

	const signingKey = getSignatureKey(secretAccessKey, dateStamp, region);
	const signature = createHmac("sha256", signingKey)
		.update(stringToSign, "utf8")
		.digest("hex");

	const authorization =
		`${ALGORITHM} Credential=${accessKeyId}/${credentialScope}, ` +
		`SignedHeaders=${signedHeaders}, Signature=${signature}`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-amz-json-1.1",
			"X-Amz-Date": amzDate,
			"X-Amz-Target": `secretsmanager.${action}`,
			Authorization: authorization,
		},
		body: payload,
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `AWS Secrets Manager request failed (${response.status}): ${text || response.statusText}`,
		});
	}

	return (await response.json()) as T;
};

interface GetSecretValueResponse {
	SecretString?: string;
	SecretBinary?: string;
}

export const fetchAwsSecret = async (
	provider: SecretProvider,
	secretId: string,
	key?: string,
): Promise<string> => {
	if (
		!provider.awsAccessKeyId ||
		!provider.awsSecretAccessKey ||
		!provider.awsRegion
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "AWS Secrets Manager provider is missing credentials",
		});
	}

	const result = await callAwsSecretsManager<GetSecretValueResponse>({
		accessKeyId: provider.awsAccessKeyId,
		secretAccessKey: provider.awsSecretAccessKey,
		region: provider.awsRegion,
		endpoint: provider.awsEndpoint,
		action: "GetSecretValue",
		body: { SecretId: secretId },
	});

	const raw = result.SecretString;
	if (raw === undefined) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `AWS secret "${secretId}" has no SecretString value`,
		});
	}

	if (!key) {
		return raw;
	}

	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const value = parsed[key];
		if (value === undefined) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `AWS secret "${secretId}" has no field "${key}"`,
			});
		}
		return typeof value === "string" ? value : JSON.stringify(value);
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `AWS secret "${secretId}" is not valid JSON; cannot select key "${key}"`,
		});
	}
};

export const testAwsSecretsConnection = async (provider: {
	awsAccessKeyId?: string | null;
	awsSecretAccessKey?: string | null;
	awsRegion?: string | null;
	awsEndpoint?: string | null;
}) => {
	if (
		!provider.awsAccessKeyId ||
		!provider.awsSecretAccessKey ||
		!provider.awsRegion
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "AWS Access Key ID, Secret Access Key, and Region are required",
		});
	}
	await callAwsSecretsManager({
		accessKeyId: provider.awsAccessKeyId,
		secretAccessKey: provider.awsSecretAccessKey,
		region: provider.awsRegion,
		endpoint: provider.awsEndpoint,
		action: "ListSecrets",
		body: { MaxResults: 1 },
	});
};
