import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  answered: z.boolean().optional(),
  meetingHeld: z.boolean().optional(),
  followUpDate: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  comment2: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.teleSalesData.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // الموظفة تقدر تعدّل بيانتها هي بس؛ Admin/Head of Tele-Sales يقدروا
  // يعدّلوا بيانات أي حد (نفس صلاحية مشاهدة الكل).
  const isOwner = row.ownerId === session.user.id;
  const isManager = can(session.user.role, "VIEW_ALL_TELE_SALES_DATA");
  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const updated = await prisma.teleSalesData.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.answered !== undefined ? { answered: parsed.data.answered } : {}),
      ...(parsed.data.meetingHeld !== undefined ? { meetingHeld: parsed.data.meetingHeld } : {}),
      ...(parsed.data.followUpDate !== undefined
        ? { followUpDate: parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : null }
        : {}),
      ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
      ...(parsed.data.comment2 !== undefined ? { comment2: parsed.data.comment2 } : {}),
    },
  });

  return NextResponse.json({ success: true, row: updated });
}
