import { Role } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { generateInviteToken, getInviteExpiry, buildInviteLink } from "@/lib/invite-token";

// GET /api/users — all users (Admin only)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_USERS")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      passwordHash: true,
      _count: { select: { assignedLeads: true } },
    },
  });

  // Never send the hash itself to the client — just whether the account
  // still needs to go through the invite flow.
  const result = users.map(({ passwordHash, ...u }) => ({
    ...u,
    needsActivation: !passwordHash,
  }));

  return NextResponse.json(result);
}

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Username can only contain English letters and numbers"),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  role: z.nativeEnum(Role),
});

// POST /api/users — create a new user (Admin only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_USERS")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: parsed.data.username }, { email: parsed.data.email }] },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This username or email already exists" },
      { status: 409 }
    );
  }

  const inviteToken = generateInviteToken();
  const inviteTokenExpiresAt = getInviteExpiry();

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      username: parsed.data.username,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      role: parsed.data.role,
      inviteToken,
      inviteTokenExpiresAt,
    },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
    },
  });

  const inviteLink = buildInviteLink(inviteToken, req.nextUrl.origin);

  return NextResponse.json({ success: true, user, inviteLink });
}
