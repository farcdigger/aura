import ReactMarkdown from "react-markdown";
import Link from "next/link";
import remarkGfm from "remark-gfm";
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
    .or("source.is.null,source.eq.graph") // Only show Graph reports (exclude Raydium)
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

// Make page dynamic to always fetch latest report
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function YamaAgentPage() {
  const latest = await getLatestReport();

  const reportBody =
    typeof latest?.report === "string"
      ? latest.report
      : latest?.report
        ? JSON.stringify(latest.report, null, 2)
        : "";

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
            Raporlar her 12 saatte (TR 12:00 & 00:00) otomatik güncellenir.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Reports refresh every 12h at 09:00 & 21:00 UTC automatically.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-gray-600 underline-offset-4 hover:underline dark:text-gray-300"
        >
          ← Back to home
        </Link>
      </div>

      <section className="mt-6 space-y-4 rounded-2xl border border-gray-200/70 bg-white/90 p-6 shadow-xl ring-1 ring-black/5 backdrop-blur dark:border-gray-800/70 dark:bg-gray-900/70">
        {latest ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200/60 bg-gray-50/80 p-4 text-sm text-gray-600 shadow-inner dark:border-gray-800/80 dark:bg-gray-800/60 dark:text-gray-300">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Generated at
                </p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {latest.generatedAt
                    ? new Date(latest.generatedAt).toLocaleString()
                    : "Unknown"}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/60 bg-gray-50/80 p-4 text-sm text-gray-600 shadow-inner dark:border-gray-800/80 dark:bg-gray-800/60 dark:text-gray-300">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Model
                </p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {latest.modelUsed}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200/60 bg-gray-50/80 p-4 text-sm text-gray-600 shadow-inner dark:border-gray-800/80 dark:bg-gray-800/60 dark:text-gray-300">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Tokens in prompt
                </p>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {latest.tokensUsed
                    ? latest.tokensUsed.toLocaleString()
                    : "—"}
                </p>
              </div>
            </div>

            <article className="prose prose-sm max-w-none rounded-2xl border border-gray-100 bg-white/80 p-6 text-gray-900 shadow-sm ring-1 ring-black/5 backdrop-blur dark:prose-invert dark:border-gray-800 dark:bg-black/40 dark:text-gray-100">
              {reportBody ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {reportBody}
                </ReactMarkdown>
              ) : (
                "Report body is empty."
              )}
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

