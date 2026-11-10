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

// Lets a Sales employee ask a free-form question about a specific meeting
// ("what did the client say about pricing?", "ذكر إمتى عايز يبدأ؟") and get
// an answer grounded in that meeting's actual transcript — so they don't
// have to re-read the whole thing to find one point. Same correction
// instructions as translateAndRecommend (code-switched/garbled wording),
// plus the prior Q&A turns so follow-up questions ("و بعدين؟") still make
// sense without the employee repeating context.
export async function askAboutMeeting(params: {
  question: string;
  transcriptText: string;
  priorQA?: { question: string; answer: string }[];
}): Promise<{ success: boolean; answer?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("askAboutMeeting: GEMINI_API_KEY is not configured");
    return { success: false, error: "Gemini isn't configured on the server" };
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  // Keep comfortably inside the free tier's per-request token budget.
  const transcriptExcerpt = params.transcriptText.slice(0, 20000);

  const historyBlock = (params.priorQA && params.priorQA.length > 0)
    ? params.priorQA.slice(-5).map((qa) => `سؤال سابق: ${qa.question}\nالإجابة: ${qa.answer}`).join("\n\n")
    : "(لا يوجد أسئلة سابقة)";

  const prompt = `
أنت مساعد مبيعات بترد على سؤال موظف عن اجتماع مبيعات معين، بناءً على التفريغ الصوتي الكامل بتاعه فقط.

مهم جدًا: التفريغ ده جاي من speech-to-text لمكالمة حقيقية، فممكن يكون فيه خلط بين كلام عربي وكلمات إنجليزية في نفس الجملة، أو كلمات مش واضحة بسبب جودة الصوت. قبل ما تجاوب، افهم المعنى المقصود وصحّح الكلمات الغامضة لأقرب كلمة صح في السياق — من غير ما تنوّه عن التصحيح، بس استخدم المعنى الصح في إجابتك.

التفريغ الكامل للاجتماع:
${transcriptExcerpt || "(transcript unavailable)"}

الأسئلة السابقة في نفس المحادثة (لو السؤال الحالي متابعة لها):
${historyBlock}

السؤال الحالي من الموظف:
${params.question}

المطلوب: جاوب بالعربي، بإيجاز ووضوح، واستند فقط على اللي اتقال فعليًا في التفريغ. لو النقطة دي مش موجودة في التفريغ خالص، قول بصراحة إن المعلومة دي مش موجودة في الاجتماع بدل ما تخترع إجابة. رجّع نص عادي بس (من غير JSON ومن غير markdown fences).
`.trim();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const message = json?.error?.message || `HTTP ${res.status}`;
      console.error("askAboutMeeting: Gemini returned an error", message);
      return { success: false, error: message };
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return { success: false, error: "Gemini returned no content" };
    }

    return { success: true, answer: text };
  } catch (e) {
    console.error("askAboutMeeting: request to Gemini failed", e);
    return { success: false, error: "Failed to reach Gemini" };
  }
}

// Produces a cleaned-up copy of the FULL raw transcript — not a summary —
// fixing code-switched Arabic/English words and unclear speech-to-text
// artifacts to their nearest correct meaning, same correction rule as
// translateAndRecommend/askAboutMeeting, but applied to the whole transcript
// instead of condensing it. This is what gets shown instead of the raw
// transcript once it's ready, and is also the preferred source for
// askAboutMeeting once saved (cleaner ground truth than the raw copy).
//
// Capped at ~24,000 input characters to stay within one Gemini call's
// practical output budget — a meeting longer than that only gets its first
// portion corrected; the rest stays as the raw transcript appended as-is
// below a note, so nothing is silently dropped.
export async function correctTranscript(params: {
  transcriptText: string;
}): Promise<{ success: boolean; correctedText?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("correctTranscript: GEMINI_API_KEY is not configured");
    return { success: false, error: "Gemini isn't configured on the server" };
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const CAP = 24000;
  const toCorrect = params.transcriptText.slice(0, CAP);
  const remainder = params.transcriptText.slice(CAP);

  const prompt = `
أنت مساعد مبيعات. تحت تفريغ صوتي كامل (transcript) لاجتماع مبيعات حقيقي، جاي من speech-to-text.

مهم جدًا: التفريغ ده ممكن يكون فيه خلط بين كلام عربي وكلمات إنجليزية في نفس الجملة (code-switching طبيعي في مكالمات المبيعات)، أو كلمات مش واضحة أو غلط بسبب جودة الصوت (زي الأخطاء الإملائية في نص مكتوب بسرعة).

المطلوب: رجّع نفس التفريغ **كامل، بنفس الترتيب وبنفس عدد الأسطر تقريبًا، من غير تلخيص أو حذف أو اختصار لأي جزء** — بس صحّح الكلمات الغامضة أو الغلط لأقرب كلمة صح في السياق. سيب أسماء المتحدثين (لو موجودة) واللغة الأصلية للجملة زي ما هي، وصحّح بس الكلمات اللي واضح إنها غلط إملائي أو نتيجة خلط لغوي. لو جزء كامل مش مفهوم خالص وملوش معنى واضح من السياق، سيبه زي ما هو من غير ما تخترع معنى.

رجّع نص عادي بس (من غير JSON ومن غير markdown fences).

التفريغ:
${toCorrect}
`.trim();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const message = json?.error?.message || `HTTP ${res.status}`;
      console.error("correctTranscript: Gemini returned an error", message);
      return { success: false, error: message };
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return { success: false, error: "Gemini returned no content" };
    }

    const correctedText = remainder
      ? `${text}\n\n[لم يتم تصحيح الباقي — الجزء التالي خام كما هو]\n${remainder}`
      : text;

    return { success: true, correctedText };
  } catch (e) {
    console.error("correctTranscript: request to Gemini failed", e);
    return { success: false, error: "Failed to reach Gemini" };
  }
}
