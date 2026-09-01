import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : "/admin";

  return (
    <main className="flex-1 flex items-center justify-center bg-surface-2/40 px-5">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <span className="w-11 h-11 rounded-xl bg-primary text-primary-ink flex items-center justify-center font-display font-bold text-base mb-3">
            EB
          </span>
          <h1 className="font-display font-semibold text-xl text-ink">
            Ebsons Command Center
          </h1>
          <p className="text-sm text-ink-faint mt-1">Staff sign in</p>
        </div>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
