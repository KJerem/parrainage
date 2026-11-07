import { LOGOUT_ACTION } from "@/components/layout/nav-config";
import { SignOutForm } from "@/components/layout/sign-out-form";
import { Button, type ButtonAsButtonProps } from "@/components/ui/button";

export type LogoutButtonProps = Omit<ButtonAsButtonProps, "type" | "children"> & {
  label?: string;
  formClassName?: string;
};

/** Même formulaire POST que l'entrée « Se déconnecter » du menu de compte (sans JavaScript). */
export function LogoutButton({
  label = "Se déconnecter",
  variant = "secondary",
  formClassName,
  ...props
}: LogoutButtonProps) {
  return (
    <SignOutForm action={LOGOUT_ACTION} className={formClassName}>
      <Button type="submit" variant={variant} {...props}>
        {label}
      </Button>
    </SignOutForm>
  );
}
