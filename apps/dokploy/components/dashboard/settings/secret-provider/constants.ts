export const SECRET_PROVIDER_OPTIONS = [
	{
		key: "vault",
		name: "HashiCorp Vault",
		description: "Fetch secrets from a Vault KV v2 engine.",
	},
	{
		key: "aws-secrets",
		name: "AWS Secrets Manager",
		description: "Fetch secrets from AWS Secrets Manager.",
	},
] as const;

export type SecretProviderOptionKey =
	(typeof SECRET_PROVIDER_OPTIONS)[number]["key"];
