// Thin wrapper around Google's Gemini API (free tier) — plain fetch, no SDK,
// same lightweight pattern as src/lib/email.ts and src/lib/fireflies.ts.
//
// Requires:
//   GEMINI_API_KEY — get a free key at https://aistudio.google.com/apikey
//                     (no Google Workspace or billing account needed)
//   GEMINI_MODEL   — optional, defaults to "gemini-2.5-flash" below. That
//                     model is confirmed (as of Nov 2026) to still be on
//                     Google's free tier with generous limits. If Google
//                     retires it or you'd rather use whatever their newest
//                     free "flash" model is, open https://aistudio.google.com
//                     → "Get API key" page, which lists the current free
//                     models by name, and set GEMINI_MODEL to that name —
//                     no code change needed.
//
// Endpoint shape (Google's long-stable public REST API):
//   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";

export interface MeetingAiResult {
  translationArabic: string;
  recommendations: string;
}

// Sends the English transcript + Fireflies' own summary to Gemini and asks
// for (1) an Arabic translation of the summary and (2) concrete Arabic
// follow-up recommendations for the Sales employee, in one call to keep
// free-tier usage low.
export async function translateAndRecommend(params: {
  leadName: string;
  summaryOverview: string;
  summaryBulletGist: string;
  actionItems: string;
  transcriptText: string;
}): Promise<{ success: boolean; result?: MeetingAiResult; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("translateAndRecommend: GEMINI_API_KEY is not configured");
    return { success: false, error: "Gemini isn't configured on the server" };
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  // Trim the transcript so we stay comfortably inside the free tier's
  // per-request token budget — the summary carries most of the signal
  // Gemini needs; the raw transcript is just extra context.
  const transcriptExcerpt = params.transcriptText.slice(0, 12000);

  const prompt = `
أنت مساعد مبيعات. تحتاج تحليل اجتماع مبيعات باللغة الإنجليزية (ملخص + تفريغ جزئي) وإعادة صياغته بالعربية للموظف.

اسم العميل: ${params.leadName}

ملخص الاجتماع (إنجليزي):
${params.summaryOverview || "(no overview provided)"}

النقاط الأساسية:
${params.summaryBulletGist || "(none)"}

المهام المطلوبة بعد الاجتماع:
${params.actionItems || "(none)"}

مقتطف من التفريغ الصوتي الكامل:
${transcriptExcerpt || "(transcript unavailable)"}

المطلوب: رجّع النتيجة كـ JSON فقط، بدون أي نص إضافي قبله أو بعده، بالشكل ده بالضبط:
{
  "translationArabic": "ترجمة عربية واضحة ومختصرة لملخص الاجتماع (3-6 جمل)",
  "recommendations": "اقتراحات متابعة عملية وواضحة لموظف المبيعات بالعربي، كنقاط مرقمة"
}
`.trim();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const message = json?.error?.message || `HTTP ${res.status}`;
      console.error("translateAndRecommend: Gemini returned an error", message);
      return { success: false, error: message };
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { success: false, error: "Gemini returned no content" };
    }

    let parsed: { translationArabic?: string; recommendations?: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      // Fallback: Gemini occasionally wraps JSON in markdown fences despite
      // responseMimeType — strip a leading/trailing ```json fence and retry.
      const stripped = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(stripped);
    }

    if (!parsed.translationArabic || !parsed.recommendations) {
      return { success: false, error: "Gemini response was missing expected fields" };
    }

    return {
      success: true,
      result: {
        translationArabic: parsed.translationArabic,
        recommendations: parsed.recommendations,
      },
    };
  } catch (e) {
    console.error("translateAndRecommend: request to Gemini failed", e);
    return { success: false, error: "Failed to reach Gemini" };
  }
}
