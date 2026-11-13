import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, UserX } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError, api } from "../lib/api";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  RoleBadge,
  Select,
  Spinner,
  StatusBadge,
} from "../components/ui";
import { ROLE_LABELS, ROLES, type Role, type User } from "../lib/types";

interface FormValues {
  name: string;
  email: string;
  role: Role;
  jobTitle: string;
  password: string;
  active: boolean;
}

const EMPTY: FormValues = { name: "", email: "", role: "SALES", jobTitle: "", password: "", active: true };

function UserDialog({
  open,
  user,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  user: User | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [values, setValues] = useState<FormValues>(EMPTY);

  useEffect(() => {
    if (!open) return;
    setValues(
      user
        ? {
            name: user.name,
            email: user.email,
            role: user.role,
            jobTitle: user.jobTitle ?? "",
            password: "",
            active: user.active,
          }
        : EMPTY,
    );
  }, [open, user]);

  const set = (patch: Partial<FormValues>) => setValues((v) => ({ ...v, ...patch }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? "Benutzer bearbeiten" : "Neuer Benutzer"}
      description={user ? "Rolle, Status und Passwort anpassen." : "Zugang für das Team anlegen."}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(values);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={values.name} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <Field label="Funktion">
            <Input
              value={values.jobTitle}
              onChange={(e) => set({ jobTitle: e.target.value })}
              placeholder="z. B. Verkaufsberater"
            />
          </Field>
        </div>

        <Field label="E-Mail">
          <Input type="email" value={values.email} onChange={(e) => set({ email: e.target.value })} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rolle">
            <Select value={values.role} onChange={(e) => set({ role: e.target.value as Role })}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={values.active ? "1" : "0"} onChange={(e) => set({ active: e.target.value === "1" })}>
              <option value="1">Aktiv</option>
              <option value="0">Inaktiv</option>
            </Select>
          </Field>
        </div>

        <Field
          label={user ? "Neues Passwort (optional)" : "Passwort"}
          hint={user ? "Leer lassen, um das Passwort nicht zu ändern." : "Mindestens 8 Zeichen."}
        >
          <Input
            type="password"
            value={values.password}
            onChange={(e) => set({ password: e.target.value })}
            placeholder={user ? "••••••••" : "Mindestens 8 Zeichen"}
            autoComplete="new-password"
          />
        </Field>

        {error ? <Alert>{error}</Alert> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Speichern …" : user ? "Speichern" : "Anlegen"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "ADMIN";
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/users"),
  });

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [formError, setFormError] = useState("");
  const [tableError, setTableError] = useState("");

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setFormError("");
  };

  const createUser = useMutation({
    mutationFn: (v: { name: string; email: string; role: Role; jobTitle?: string; password: string }) =>
      api<User>("/users", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      closeDialog();
    },
    onError: (e: unknown) => setFormError(e instanceof ApiError ? e.message : "Anlegen fehlgeschlagen"),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, ...v }: { id: string } & Record<string, unknown>) =>
      api<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(v) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      closeDialog();
    },
    onError: (e: unknown) => setFormError(e instanceof ApiError ? e.message : "Speichern fehlgeschlagen"),
  });

  const deactivateUser = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
    onError: (e: unknown) => setTableError(e instanceof ApiError ? e.message : "Deaktivieren fehlgeschlagen"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const submit = (values: FormValues) => {
    setFormError("");
    if (!values.name.trim()) return setFormError("Name fehlt.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) return setFormError("Gültige E-Mail angeben.");

    if (editing) {
      const payload: Record<string, unknown> = {
        name: values.name.trim(),
        email: values.email.trim(),
        role: values.role,
        jobTitle: values.jobTitle.trim() || null,
        active: values.active,
      };
      if (values.password) {
        if (values.password.length < 8) return setFormError("Passwort: mindestens 8 Zeichen.");
        payload.password = values.password;
      }
      updateUser.mutate({ id: editing.id, ...payload });
      return;
    }

    if (values.password.length < 8) return setFormError("Passwort: mindestens 8 Zeichen.");
    createUser.mutate({
      name: values.name.trim(),
      email: values.email.trim(),
      role: values.role,
      jobTitle: values.jobTitle.trim() || undefined,
      password: values.password,
    });
  };

  const saving = createUser.isPending || updateUser.isPending;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
          <p className="mt-1 text-sm text-slate-500">
            Benutzer, Rollen und Zugang zum Betriebssystem.
          </p>
        </div>
        {isAdmin ? (
          <Button
            onClick={() => {
              setEditing(null);
              setFormError("");
              setOpen(true);
            }}
          >
            <Plus size={16} />
            Neuer Benutzer
          </Button>
        ) : null}
      </header>

      {tableError ? <Alert>{tableError}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="relative w-full max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name oder E-Mail suchen"
              className="pl-9"
            />
          </div>
          <p className="text-xs text-slate-500">
            {filtered.length} {filtered.length === 1 ? "Eintrag" : "Einträge"}
          </p>
        </div>

        {isLoading ? (
          <div className="px-5 py-6">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Keine Benutzer gefunden"
            description={search ? "Suchbegriff anpassen." : "Noch keine Benutzer angelegt."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">E-Mail</th>
                  <th className="px-5 py-3 font-semibold">Rolle</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  {isAdmin ? <th className="px-5 py-3 text-right font-semibold">Aktionen</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                          {u.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{u.name}</p>
                          {u.jobTitle ? <p className="text-xs text-slate-500">{u.jobTitle}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{u.email}</td>
                    <td className="px-5 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge active={u.active} />
                    </td>
                    {isAdmin ? (
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Bearbeiten"
                            onClick={() => {
                              setEditing(u);
                              setFormError("");
                              setOpen(true);
                            }}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            title="Deaktivieren"
                            disabled={!u.active || u.id === me?.id}
                            onClick={() => {
                              if (!window.confirm(`${u.name} wirklich deaktivieren?`)) return;
                              setTableError("");
                              deactivateUser.mutate(u.id);
                            }}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          >
                            <UserX size={15} />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <UserDialog
        open={open}
        user={editing}
        saving={saving}
        error={formError}
        onClose={closeDialog}
        onSubmit={submit}
      />
    </div>
  );
}