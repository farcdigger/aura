import Link from "next/link";
import { supabaseClient } from "@/lib/db-supabase";

// Type for graph_reports table row
type GraphReport = {
  report_date: string;
  generated_at: string;
  model_used: string;
  tokens_used: number;
  report_content: any;
};

async function getLatestReport() {
  if (!supabaseClient) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from("graph_reports")
    .select(
      "report_date, generated_at, model_used, tokens_used, report_content",
    )
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: GraphReport | null; error: any };

  if (error || !data) {
    if (error) {
      console.error("[yama-agent/page] Supabase error:", error);
    }
    return null;
  }

  return {
    generatedAt:
      data.generated_at ?? data.report_content?.generatedAt ?? data.report_date,
    modelUsed: data.model_used ?? data.report_content?.modelUsed ?? "unknown",
    tokensUsed: data.tokens_used ?? data.report_content?.tokensUsed ?? null,
    report: data.report_content?.report ?? data.report_content ?? "",
  };
}

export const dynamic = "force-static";
export const revalidate = 0;

export default async function YamaAgentPage() {
  const latest = await getLatestReport();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 lg:py-12">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Intelligence Hub
          </p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
            Yama Agent Latest Report
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Raporlar her 12 saatte (TR 10:00 & 22:00) otomatik güncellenir.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-gray-600 underline-offset-4 hover:underline dark:text-gray-300"
        >
          ← Back to home
        </Link>
      </div>

      <section className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-black">
        {latest ? (
          <>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <p>
                Generated at:{" "}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {latest.generatedAt
                    ? new Date(latest.generatedAt).toLocaleString()
                    : "Unknown"}
                </span>
              </p>
              <p>
                Model:{" "}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {latest.modelUsed}
                </span>
                {latest.tokensUsed
                  ? ` • Tokens in prompt: ${latest.tokensUsed.toLocaleString()}`
                  : null}
              </p>
            </div>

            <article className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-900 dark:prose-invert dark:text-gray-100">
              {latest.report || "Report body is empty."}
            </article>
          </>
        ) : (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p>No report found yet. Trigger the agent to generate the first one.</p>
          </div>
        )}
      </section>
    </main>
  );
}

