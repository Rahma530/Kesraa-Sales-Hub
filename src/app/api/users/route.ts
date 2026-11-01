import { Role } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

import bcrypt from "bcryptjs";

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
      _count: { select: { assignedLeads: true } },
    },
  });

  return NextResponse.json(users);
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
  password: z.string().min(6, "Password must be at least 6 characters"),
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

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      username: parsed.data.username,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      role: parsed.data.role,
      passwordHash,
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

  return NextResponse.json({ success: true, user });
}
