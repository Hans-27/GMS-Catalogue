"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, login } from "@/lib/api";
import { isCustomerUser } from "@/lib/access";
import { useLanguage } from "@/lib/i18n";
import styles from "./login.module.css";

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.7 10.7 0 0 1 12 4c5.4 0 9 5.2 9 5.2a14 14 0 0 1-2.2 2.7M6.6 6.7A15.6 15.6 0 0 0 3 10s3.6 5.2 9 5.2c1 0 2-.2 2.8-.6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 10s3.6-5.2 9-5.2S21 10 21 10s-3.6 5.2-9 5.2S3 10 3 10Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const user = await login({
        identifier: identifier.trim(),
        password,
        remember_me: rememberMe,
      });
      const requestedPath = searchParams.get("next");
      const safeCustomerPath =
        requestedPath?.startsWith("/customer") && !requestedPath.startsWith("//")
          ? requestedPath
          : "/customer";
      router.replace(isCustomerUser(user) ? safeCustomerPath : "/dashboard");
      router.refresh();
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(
          t("The catalogue service is unavailable. Check your connection and try again."),
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && (
        <div className={styles.error} role="alert">
          <span aria-hidden="true">!</span>
          <p>{error}</p>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="login-identifier">{t("Username or email")}</label>
        <input
          id="login-identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("Enter your username or email")}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          minLength={3}
          maxLength={255}
          required
          autoFocus
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="login-password">{t("Password")}</label>
        <div className={styles.passwordField}>
          <input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder={t("Enter your password")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            maxLength={1024}
            required
            disabled={isSubmitting}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            onMouseDown={(event) => event.preventDefault()}
            aria-label={t(showPassword ? "Hide password" : "Show password")}
            aria-pressed={showPassword}
            disabled={isSubmitting}
          >
            <EyeIcon hidden={showPassword} />
          </button>
        </div>
      </div>

      <div className={styles.formOptions}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            disabled={isSubmitting}
          />
          <span aria-hidden="true" />
          {t("Remember me")}
        </label>
        <a href="mailto:it.support@gms.co.th?subject=Catalogue password reset">
          {t("Forgot password?")}
        </a>
      </div>

      <button
        className={styles.submitButton}
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <i className={styles.spinner} aria-hidden="true" />
            {t("Signing in...")}
          </>
        ) : (
          <>
            {t("Sign in")}
            <span aria-hidden="true">→</span>
          </>
        )}
      </button>
    </form>
  );
}
