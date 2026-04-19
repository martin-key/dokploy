import {
	SECRET_PROVIDER_NAME_ERROR,
	SECRET_PROVIDER_NAME_REGEX,
} from "@dokploy/server/db/validations/secret-provider";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { SECRET_PROVIDER_OPTIONS } from "./constants";

const baseSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.regex(SECRET_PROVIDER_NAME_REGEX, SECRET_PROVIDER_NAME_ERROR),
	providerType: z.enum(["vault", "aws-secrets"]),
	vaultAddress: z.string().optional(),
	vaultToken: z.string().optional(),
	vaultNamespace: z.string().optional(),
	vaultMountPath: z.string().optional(),
	awsAccessKeyId: z.string().optional(),
	awsSecretAccessKey: z.string().optional(),
	awsRegion: z.string().optional(),
	awsEndpoint: z.string().optional(),
});

const addSecretProvider = baseSchema.superRefine((data, ctx) => {
	if (data.providerType === "vault") {
		if (!data.vaultAddress) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["vaultAddress"],
				message: "Vault address is required",
			});
		} else {
			try {
				new URL(data.vaultAddress);
			} catch {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["vaultAddress"],
					message: "Must be a valid URL",
				});
			}
		}
	}
	if (data.providerType === "aws-secrets") {
		if (!data.awsAccessKeyId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["awsAccessKeyId"],
				message: "AWS Access Key ID is required",
			});
		}
		if (!data.awsRegion) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["awsRegion"],
				message: "AWS Region is required",
			});
		}
	}
});

type AddSecretProvider = z.infer<typeof addSecretProvider>;

interface Props {
	secretProviderId?: string;
}

const emptyDefaults: AddSecretProvider = {
	name: "",
	providerType: "vault",
	vaultAddress: "",
	vaultToken: "",
	vaultNamespace: "",
	vaultMountPath: "",
	awsAccessKeyId: "",
	awsSecretAccessKey: "",
	awsRegion: "",
	awsEndpoint: "",
};

export const HandleSecretProviders = ({ secretProviderId }: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const { mutateAsync, isError, error, isPending } = secretProviderId
		? api.secretProvider.update.useMutation()
		: api.secretProvider.create.useMutation();

	const { data: secretProvider } = api.secretProvider.one.useQuery(
		{ secretProviderId: secretProviderId || "" },
		{ enabled: !!secretProviderId, refetchOnWindowFocus: false },
	);

	const {
		mutateAsync: testConnection,
		isPending: isPendingConnection,
		error: connectionError,
		isError: isErrorConnection,
	} = api.secretProvider.testConnection.useMutation();

	const form = useForm<AddSecretProvider>({
		defaultValues: emptyDefaults,
		resolver: zodResolver(addSecretProvider),
	});

	const providerType = form.watch("providerType");

	useEffect(() => {
		if (secretProvider) {
			form.reset({
				name: secretProvider.name,
				providerType: secretProvider.providerType as "vault" | "aws-secrets",
				vaultAddress: secretProvider.vaultAddress ?? "",
				vaultToken: "",
				vaultNamespace: secretProvider.vaultNamespace ?? "",
				vaultMountPath: secretProvider.vaultMountPath ?? "",
				awsAccessKeyId: secretProvider.awsAccessKeyId ?? "",
				awsSecretAccessKey: "",
				awsRegion: secretProvider.awsRegion ?? "",
				awsEndpoint: secretProvider.awsEndpoint ?? "",
			});
		} else {
			form.reset(emptyDefaults);
		}
	}, [form, secretProvider]);

	const onSubmit = async (data: AddSecretProvider) => {
		const payload = {
			name: data.name,
			providerType: data.providerType,
			vaultAddress: data.vaultAddress || null,
			vaultToken: data.vaultToken || null,
			vaultNamespace: data.vaultNamespace || null,
			vaultMountPath: data.vaultMountPath || null,
			awsAccessKeyId: data.awsAccessKeyId || null,
			awsSecretAccessKey: data.awsSecretAccessKey || null,
			awsRegion: data.awsRegion || null,
			awsEndpoint: data.awsEndpoint || null,
		};
		try {
			if (secretProviderId) {
				await mutateAsync({ ...payload, secretProviderId } as any);
			} else {
				if (data.providerType === "vault" && !data.vaultToken) {
					toast.error("Vault token is required");
					return;
				}
				if (data.providerType === "aws-secrets" && !data.awsSecretAccessKey) {
					toast.error("AWS Secret Access Key is required");
					return;
				}
				await mutateAsync(payload as any);
			}
			toast.success(
				`Secret provider ${secretProviderId ? "updated" : "created"}`,
			);
			await utils.secretProvider.all.invalidate();
			if (secretProviderId) {
				await utils.secretProvider.one.invalidate({ secretProviderId });
			}
			setOpen(false);
		} catch (e) {
			toast.error(
				`Error ${secretProviderId ? "updating" : "creating"} the secret provider`,
				{ description: (e as Error).message },
			);
		}
	};

	const handleTestConnection = async () => {
		const ok = await form.trigger([
			"providerType",
			"vaultAddress",
			"vaultToken",
			"awsAccessKeyId",
			"awsSecretAccessKey",
			"awsRegion",
		]);
		if (!ok) {
			toast.error("Please fill all required fields");
			return;
		}
		const values = form.getValues();
		try {
			await testConnection({
				name: values.name || "test",
				providerType: values.providerType,
				vaultAddress: values.vaultAddress || null,
				vaultToken: values.vaultToken || null,
				vaultNamespace: values.vaultNamespace || null,
				vaultMountPath: values.vaultMountPath || null,
				awsAccessKeyId: values.awsAccessKeyId || null,
				awsSecretAccessKey: values.awsSecretAccessKey || null,
				awsRegion: values.awsRegion || null,
				awsEndpoint: values.awsEndpoint || null,
			} as any);
			toast.success("Connection successful");
		} catch (e) {
			toast.error("Connection failed", {
				description: (e as Error).message,
			});
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{secretProviderId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						Add Secret Provider
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{secretProviderId ? "Update" : "Add"} Secret Provider
					</DialogTitle>
					<DialogDescription>
						Connect an external secret manager so applications can reference
						secrets via{" "}
						<code className="text-xs">{"{{secret.<name>.<path>}}"}</code>.
					</DialogDescription>
				</DialogHeader>
				{(isError || isErrorConnection) && (
					<AlertBlock type="error" className="w-full">
						{connectionError?.message || error?.message}
					</AlertBlock>
				)}

				<Form {...form}>
					<form
						id="hook-form-secret-provider-add"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="prod-vault" {...field} />
									</FormControl>
									<FormDescription>
										Used as the identifier in{" "}
										<code>{"{{secret.<name>.<path>}}"}</code>.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="providerType"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Provider</FormLabel>
									<FormControl>
										<Select
											onValueChange={field.onChange}
											value={field.value}
											disabled={!!secretProviderId}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select a provider" />
											</SelectTrigger>
											<SelectContent>
												{SECRET_PROVIDER_OPTIONS.map((option) => (
													<SelectItem key={option.key} value={option.key}>
														{option.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{providerType === "vault" && (
							<>
								<FormField
									control={form.control}
									name="vaultAddress"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Vault Address</FormLabel>
											<FormControl>
												<Input
													placeholder="https://vault.example.com:8200"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="vaultToken"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Vault Token
												{secretProviderId && (
													<span className="text-muted-foreground text-xs ml-2">
														(leave empty to keep current)
													</span>
												)}
											</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="hvs.XXXXXXXXXXXXXXXX"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="vaultMountPath"
									render={({ field }) => (
										<FormItem>
											<FormLabel>KV Mount Path (Optional)</FormLabel>
											<FormControl>
												<Input placeholder="secret" {...field} />
											</FormControl>
											<FormDescription>
												Defaults to <code>secret</code> if left blank.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="vaultNamespace"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Namespace (Optional)</FormLabel>
											<FormControl>
												<Input placeholder="admin/team-a" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{providerType === "aws-secrets" && (
							<>
								<FormField
									control={form.control}
									name="awsAccessKeyId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Access Key ID</FormLabel>
											<FormControl>
												<Input placeholder="AKIAIOSFODNN7EXAMPLE" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="awsSecretAccessKey"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Secret Access Key
												{secretProviderId && (
													<span className="text-muted-foreground text-xs ml-2">
														(leave empty to keep current)
													</span>
												)}
											</FormLabel>
											<FormControl>
												<Input
													type="password"
													placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="awsRegion"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Region</FormLabel>
											<FormControl>
												<Input placeholder="us-east-1" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="awsEndpoint"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Endpoint (Optional)</FormLabel>
											<FormControl>
												<Input
													placeholder="https://secretsmanager.us-east-1.amazonaws.com"
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Override for LocalStack or custom endpoints.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}
					</form>

					<DialogFooter className="flex w-full !justify-between gap-4 flex-row">
						<Button
							type="button"
							variant="secondary"
							isLoading={isPendingConnection}
							onClick={handleTestConnection}
						>
							Test connection
						</Button>
						<Button
							isLoading={isPending}
							form="hook-form-secret-provider-add"
							type="submit"
						>
							{secretProviderId ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
