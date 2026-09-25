"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, registerAccount } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import styles from "../login/login.module.css";

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

export function RegisterForm() {
  const router = useRouter();
  const { t } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmation) {
      setError(t("The passwords do not match."));
      return;
    }

    setIsSubmitting(true);
    try {
      await registerAccount({
        full_name: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
      });
      router.replace("/dashboard");
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
        <label htmlFor="register-full-name">{t("Full name")}</label>
        <input
          id="register-full-name"
          name="fullName"
          type="text"
          autoComplete="name"
          placeholder={t("Enter your full name")}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          minLength={2}
          maxLength={160}
          required
          autoFocus
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="register-username">{t("Username")}</label>
        <input
          id="register-username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("Choose a username")}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          pattern="[A-Za-z0-9._-]+"
          minLength={3}
          maxLength={80}
          required
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="register-email">{t("Email address")}</label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={255}
          required
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="register-password">{t("Password")}</label>
        <div className={styles.passwordField}>
          <input
            id="register-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder={t("Create a strong password")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            maxLength={1024}
            aria-describedby="register-password-hint"
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
        <small id="register-password-hint" className={styles.passwordHint}>
          {t("At least 12 characters with uppercase, lowercase, number and symbol.")}
        </small>
      </div>

      <div className={styles.field}>
        <label htmlFor="register-password-confirmation">{t("Confirm password")}</label>
        <div className={styles.passwordField}>
          <input
            id="register-password-confirmation"
            name="passwordConfirmation"
            type={showConfirmation ? "text" : "password"}
            autoComplete="new-password"
            placeholder={t("Enter the password again")}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            minLength={12}
            maxLength={1024}
            required
            disabled={isSubmitting}
          />
          <button
            type="button"
            onClick={() => setShowConfirmation((visible) => !visible)}
            onMouseDown={(event) => event.preventDefault()}
            aria-label={
              showConfirmation
                ? t("Hide password confirmation")
                : t("Show password confirmation")
            }
            aria-pressed={showConfirmation}
            disabled={isSubmitting}
          >
            <EyeIcon hidden={showConfirmation} />
          </button>
        </div>
      </div>

      <button
        className={styles.submitButton}
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <i className={styles.spinner} aria-hidden="true" />
            {t("Creating account...")}
          </>
        ) : (
          <>
            {t("Create account")}
            <span aria-hidden="true">→</span>
          </>
        )}
      </button>

      <p className={styles.backRow}>
        <Link className={styles.backLink} href="/login">
          ← {t("Back to sign in")}
        </Link>
      </p>
    </form>
  );
}
