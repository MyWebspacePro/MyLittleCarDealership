import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError, api } from "../lib/api";
import { Alert, Button, Card, CardHeader, Field, Input, RoleBadge } from "../components/ui";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Aktuelles Passwort eingeben"),
    newPassword: z.string().min(8, "Mindestens 8 Zeichen"),
    confirmPassword: z.string().min(1, "Bestätigung fehlt"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Die Passwörter stimmen nicht überein",
    path: ["confirmPassword"],
  });
type Values = z.infer<typeof schema>;

export default function Profile() {
  const { user } = useAuth();
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const changePassword = useMutation({
    mutationFn: (values: Values) =>
      api<{ ok: boolean }>("/auth/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      }),
    onSuccess: () => {
      reset();
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 4000);
    },
  });

  const initials = user?.name
    ?.split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Mein Profil</h1>
        <p className="mt-1 text-sm text-slate-500">Kontoinformationen und Passwort.</p>
      </header>

      {success ? <Alert kind="success">Passwort geändert. Andere Sitzungen wurden beendet.</Alert> : null}

      <Card>
        <CardHeader title="Konto" />
        <div className="flex items-center gap-4 px-5 py-5">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-semibold text-white">
            {initials || "?"}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900">{user?.name}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
            <div className="mt-1.5">{user ? <RoleBadge role={user.role} /> : null}</div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Passwort ändern"
          description="Nach dem Ändern werden alle anderen Sitzungen beendet."
          actions={<KeyRound size={16} className="text-slate-400" />}
        />
        <form
          onSubmit={handleSubmit((values) => changePassword.mutate(values))}
          className="max-w-md space-y-4 px-5 py-5"
        >
          <Field label="Aktuelles Passwort" error={errors.currentPassword?.message}>
            <Input type="password" autoComplete="current-password" {...register("currentPassword")} />
          </Field>
          <Field label="Neues Passwort" error={errors.newPassword?.message}>
            <Input type="password" autoComplete="new-password" {...register("newPassword")} />
          </Field>
          <Field label="Neues Passwort bestätigen" error={errors.confirmPassword?.message}>
            <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
          </Field>

          {changePassword.isError ? (
            <Alert>
              {changePassword.error instanceof ApiError
                ? changePassword.error.message
                : "Passwort konnte nicht geändert werden."}
            </Alert>
          ) : null}

          <Button type="submit" disabled={changePassword.isPending}>
            <ShieldCheck size={16} />
            {changePassword.isPending ? "Ändern …" : "Passwort ändern"}
          </Button>
        </form>
      </Card>
    </div>
  );
}