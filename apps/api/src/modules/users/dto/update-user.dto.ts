export class UpdateUserDto {
  plan?: string;

  status?: "active" | "trial" | "disabled";

  feishuEnabled?: boolean;

  expiresAt?: string;
}
