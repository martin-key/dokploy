import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { SECRET_PROVIDER_OPTIONS } from "./constants";
import { HandleSecretProviders } from "./handle-secret-providers";

const getProviderLabel = (key: string) =>
	SECRET_PROVIDER_OPTIONS.find((p) => p.key === key)?.name ?? key;

export const ShowSecretProviders = () => {
	const { data, isPending, refetch } = api.secretProvider.all.useQuery();
	const { mutateAsync, isPending: isRemoving } =
		api.secretProvider.remove.useMutation();
	const { data: permissions } = api.user.getPermissions.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<KeyRound className="size-6 text-muted-foreground self-center" />
							Secret Providers
						</CardTitle>
						<CardDescription>
							Connect external secret managers (HashiCorp Vault, AWS Secrets
							Manager) and reference secrets in environment variables using{" "}
							<code className="text-xs">
								{"{{secret.<name>.<path>[#<key>]}}"}
							</code>
							.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isPending ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
										<KeyRound className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground">
											No secret providers configured yet.
										</span>
										{permissions?.secretProvider.create && (
											<HandleSecretProviders />
										)}
									</div>
								) : (
									<div className="flex flex-col gap-4 min-h-[25vh]">
										<div className="flex flex-col gap-4 rounded-lg">
											{data?.map((secretProvider, index) => (
												<div
													key={secretProvider.secretProviderId}
													className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
												>
													<div className="flex items-center justify-between p-3.5 rounded-lg bg-background border w-full">
														<div className="flex flex-col gap-1">
															<span className="text-sm">
																{index + 1}. {secretProvider.name}
															</span>
															<span className="text-xs text-muted-foreground">
																{getProviderLabel(secretProvider.providerType)}{" "}
																· Created at:{" "}
																{new Date(
																	secretProvider.createdAt,
																).toLocaleDateString()}
															</span>
														</div>
														<div className="flex flex-row gap-1">
															{permissions?.secretProvider.update && (
																<HandleSecretProviders
																	secretProviderId={
																		secretProvider.secretProviderId
																	}
																/>
															)}
															{permissions?.secretProvider.delete && (
																<DialogAction
																	title="Delete Secret Provider"
																	description="Are you sure you want to delete this secret provider? Environment variables referencing it will fail to resolve."
																	type="destructive"
																	onClick={async () => {
																		await mutateAsync({
																			secretProviderId:
																				secretProvider.secretProviderId,
																		})
																			.then(() => {
																				toast.success(
																					"Secret provider deleted successfully",
																				);
																				refetch();
																			})
																			.catch(() => {
																				toast.error(
																					"Error deleting secret provider",
																				);
																			});
																	}}
																>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="group hover:bg-red-500/10"
																		isLoading={isRemoving}
																	>
																		<Trash2 className="size-4 text-primary group-hover:text-red-500" />
																	</Button>
																</DialogAction>
															)}
														</div>
													</div>
												</div>
											))}
										</div>

										{permissions?.secretProvider.create && (
											<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
												<HandleSecretProviders />
											</div>
										)}
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
