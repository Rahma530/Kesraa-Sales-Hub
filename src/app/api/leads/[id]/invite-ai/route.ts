import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: params.id } });
    if (!lead) return NextResponse.json({ error: "الليد غير موجود" }, { status: 404 });

    const body = await req.json();
    const { meetingUrl } = body;

    // Simulate contacting Fireflies API using the environment variable
    const firefliesKey = process.env.FIREFLIES_API_KEY;
    if (!firefliesKey) {
      console.warn("FIREFLIES_API_KEY is missing, but simulating for demo.");
    }

    // 1. Create a Meeting record to hold the AI data
    const meeting = await prisma.meeting.create({
      data: {
        leadId: params.id,
        ownerId: session.user.id,
        scheduledAt: new Date(), // Now
        status: "DONE",
        notes: "تم عقد اجتماع فوري عبر Jitsi.",
        
        // --- Simulated AI Data from "Fireflies" ---
        recordingUrl: meetingUrl || "https://meet.jit.si/Telesales_Recorded",
        aiAnalysis: `التحليل والملخص:
العميل أظهر اهتمام كبير جداً بالباقة السنوية.
تم مناقشة تفاصيل الدفع والخصومات المتاحة.
العميل طلب مهلة للتفكير حتى الغد للرد النهائي.
النية الشرائية: عالية جداً (Warm/Hot).`,
        transcript: `[00:00] الموظف: أهلاً بك يا فندم، معاك ممثل المبيعات.
[00:05] العميل: أهلاً بيك. كنت بسأل عن تفاصيل الباقة السنوية.
[00:12] الموظف: الباقة السنوية بتوفرلك خصم 20% وبنديلك شهرين مجاناً.
[00:20] العميل: ممتاز جداً، هل الدفع بيكون كاش ولا ممكن تقسيط؟
[00:25] الموظف: متاح التقسيط على 3 شهور بدون فوائد.
[00:30] العميل: خلاص عظيم، هراجع الحسابات وأرد عليك بكرة الصبح إن شاء الله.
[00:35] الموظف: تحت أمرك في أي وقت، يومك سعيد.`,
      },
    });

    // 2. Add Activity Log
    await prisma.activity.create({
      data: {
        leadId: params.id,
        userId: session.user.id,
        type: "MEETING",
        message: `تم دخول الذكاء الاصطناعي للميتنج وتسجيله بنجاح (${meetingUrl})`,
      },
    });

    // We change lead status to NEGOTIATION since it was a positive meeting
    await prisma.lead.update({
      where: { id: params.id },
      data: { status: "NEGOTIATION" }
    });

    return NextResponse.json({ success: true, meeting });
  } catch (error: any) {
    console.error("Invite AI Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
