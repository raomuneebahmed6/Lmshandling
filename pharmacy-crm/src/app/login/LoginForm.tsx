"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth-actions";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState(loginAction, {
    error: null,
  });

  return (
    <form
      action={formAction}
      className="bg-surface border border-border-c rounded-2xl p-6 space-y-4"
    >
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div>
        <label
          htmlFor="email"
          className="block text-xs font-semibold uppercase tracking-wide text-ink-faint mb-1.5"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="block text-xs font-semibold uppercase tracking-wide text-ink-faint mb-1.5"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-border-c bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </div>

      {state.error && (
        <p className="text-sm text-critical bg-critical-bg rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-primary text-primary-ink font-semibold text-sm py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-xs text-ink-faint text-center">
        Accounts are created by the pharmacy owner. There is no self sign-up.
      </p>
    </form>
  );
}
