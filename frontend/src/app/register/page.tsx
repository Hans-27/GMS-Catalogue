import type { Metadata } from "next";
import { ApplicationLogo } from "@/components/application-logo";
import { applicationBranding } from "@/lib/branding";
import { LanguageSwitcher, T } from "@/lib/i18n";
import { RegisterForm } from "./register-form";
import styles from "../login/login.module.css";

export const metadata: Metadata = {
  title: `Create account | ${applicationBranding.applicationName}`,
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

export default function RegisterPage() {
  return (
    <main className={styles.page}>
      <section className={styles.storyPanel}>
        <div className={styles.storyInner}>
          <CatalogueMark />
          <div className={styles.storyCopy}>
            <p className={styles.eyebrow}><T>Join the catalogue workspace</T></p>
            <h1><T>Create your secure staff account.</T></h1>
            <p>
              <T>New accounts start as System Users. A Superadmin can grant additional catalogue permissions when required.</T>
            </p>
          </div>
          <div className={styles.featureStrip}>
            <div>
              <span>01</span>
              <p><T>Create your profile</T></p>
            </div>
            <div>
              <span>02</span>
              <p><T>Sign in securely</T></p>
            </div>
            <div>
              <span>03</span>
              <p><T>Receive assigned access</T></p>
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
            <p><T>New staff account</T></p>
            <h2><T>Create your account</T></h2>
            <span><T>Enter your details to create a System User account.</T></span>
          </div>
          <RegisterForm />
        </div>
        <footer>
          <span>© 2026 GMS Catalogue</span>
          <span><T>Secure internal access</T></span>
        </footer>
      </section>
    </main>
  );
}
