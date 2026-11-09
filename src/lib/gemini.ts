// Thin wrapper around Google's Gemini API (free tier) — plain fetch, no SDK,
// same lightweight pattern as src/lib/email.ts and src/lib/fireflies.ts.
//
// Requires:
//   GEMINI_API_KEY — get a free key at https://aistudio.google.com/apikey
//                     (no Google Workspace or billing account needed)
//   GEMINI_MODEL   — optional, defaults to "gemini-3.8-flash" below. Google
//                     retired access to "gemini-2.5-flash" for accounts that
//                     hadn't already used it (confirmed Nov 2026 — API error:
//                     "This model models/gemini-2.5-flash is no longer
//                     available to new users ... use models/gemini-3.8-flash"),
//                     so if Google retires this one too, or you'd rather use
//                     whatever their newest free "flash" model is, open
//                     https://aistudio.google.com → "Get API key" page, which
//                     lists the current free models by name, and set
//                     GEMINI_MODEL to that name — no code change needed.
//
// Endpoint shape (Google's long-stable public REST API):
//   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.8-flash";

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
أنت مساعد مبيعات. تحتاج تحليل اجتماع مبيعات (ملخص + تفريغ جزئي) وإعادة صياغته بالعربية للموظف.

مهم جدًا: التفريغ الصوتي ده جاي من speech-to-text لمكالمة حقيقية، فممكن يكون فيه:
- خلط بين كلام عربي وكلمات إنجليزية في نفس الجملة (code-switching طبيعي في مكالمات المبيعات).
- كلمات مش واضحة أو غلط بسبب جودة الصوت (زي الأخطاء الإملائية في نص مكتوب بسرعة).
قبل ما تلخص، افهم المعنى المقصود وصحّح الكلمات الغامضة أو الغلط لأقرب كلمة صح في السياق (بالظبط زي ما تصحح فقرة فيها أخطاء إملائية) — من غير ما تنوّه أو تعلّق على التصحيح، بس استخدم المعنى الصح في الملخص النهائي. لو جزء كامل مش مفهوم خالص وملوش معنى واضح من السياق، تجاهله بدل ما تخترع معنى.

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
  "translationArabic": "ملخص عربي نظيف وواضح للاجتماع (3-6 جمل)، بعد تصحيح أي كلام غامض أو مخلوط باللغة الإنجليزية لأقرب معنى صحيح",
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
