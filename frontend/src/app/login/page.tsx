import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplicationLogo } from "@/components/application-logo";
import { applicationBranding } from "@/lib/branding";
import { LanguageSwitcher, T } from "@/lib/i18n";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: `Sign in | ${applicationBranding.applicationName}`,
};

function CatalogueMark() {
  return (
    <div className={styles.brand} aria-label={applicationBranding.applicationName}>
      <div className={styles.mark}><ApplicationLogo priority /></div>
      <div>
        <strong>{applicationBranding.companyName}</strong>
        <span><T>GMS Catalogue Platform</T></span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.storyPanel}>
        <div className={styles.storyInner}>
          <CatalogueMark />

          <div className={styles.storyCopy}>
            <p className={styles.eyebrow}><T>Catalogue Department Portal</T></p>
            <h1><T>Keep every product ready to be discovered.</T></h1>
            <p>
              <T>Manage product images and catalogue content in one secure, dependable workspace.</T>
            </p>
          </div>

          <div className={styles.featureStrip}>
            <div>
              <span>01</span>
              <p><T>Upload product images</T></p>
            </div>
            <div>
              <span>02</span>
              <p><T>Review catalogue details</T></p>
            </div>
            <div>
              <span>03</span>
              <p><T>Approve and publish</T></p>
            </div>
          </div>
        </div>
        <div className={styles.orbitOne} />
        <div className={styles.orbitTwo} />
      </section>

      <section className={styles.formPanel}>
        <LanguageSwitcher className="authLanguageSwitcher" />
        <div className={styles.mobileBrand}>
          <CatalogueMark />
        </div>
        <div className={styles.formShell}>
          <div className={styles.heading}>
            <p><T>Welcome back</T></p>
            <h2><T>Sign in to your account</T></h2>
            <span><T>Enter your staff credentials to continue.</T></span>
          </div>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <footer>
          <span>© 2026 GMS Catalogue</span>
          <span><T>Secure internal access</T></span>
        </footer>
      </section>
    </main>
  );
}
