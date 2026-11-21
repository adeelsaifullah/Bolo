import { t } from "@/lib/i18n";

// Placeholder shell. Real screens (S01 onwards) replace this in later sessions.
export default function Home() {
  return (
    <main className="shell">
      <h1>{t("app.name")}</h1>
    </main>
  );
}
