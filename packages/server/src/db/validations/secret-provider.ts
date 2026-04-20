export const SECRET_PROVIDER_TYPES = ["vault", "aws-secrets"] as const;

export type SecretProviderType = (typeof SECRET_PROVIDER_TYPES)[number];

export const SECRET_PROVIDER_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
export const SECRET_PROVIDER_NAME_ERROR =
	"Only letters, numbers, dashes and underscores are allowed";

/**
 * Matches {{secret.<providerName>.<secretPath>}} or {{secret.<providerName>.<secretPath>#<key>}}
 *   providerName: letters, numbers, dashes, underscores
 *   secretPath:   letters, numbers, dashes, underscores, slashes, dots
 *   key:          letters, numbers, dashes, underscores, dots
 */
export const SECRET_REFERENCE_REGEX =
	/\{\{\s*secret\.([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_\-./]+)(?:#([a-zA-Z0-9_\-.]+))?\s*\}\}/g;
