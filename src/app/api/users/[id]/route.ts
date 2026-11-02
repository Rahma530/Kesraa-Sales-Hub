import { Role } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, teamRoleForManager } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

import bcrypt from "bcryptjs";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  username: z.string().min(3).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().or(z.literal("")),
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(6).optional(),
});

// PATCH /api/users/[id] — update a user's data / deactivate / change role / reset password
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const isSelf = session.user.id === params.id;
  if (!isSelf && !can(session.user.role, "MANAGE_TEAM_USERS")) {
    return NextResponse.json({ error: "You are not authorized to edit other users' data" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (isSelf) {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    // Prevent self role/status change unless ADMIN doing it to themselves safely
    if (parsed.data.isActive === false) {
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
    }
    if (parsed.data.role && parsed.data.role !== user.role && session.user.role !== Role.ADMIN) {
      return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
    }

    return applyUpdate(user.id, parsed.data);
  }

  // Editing someone else: the Admin can edit anyone. A Head can only edit
  // employees within their own team, and can never change a role.
  const managedRole = teamRoleForManager(session.user.role);
  if (managedRole) {
    if (user.role !== managedRole) {
      return NextResponse.json(
        { error: "You can only manage employees in your own team" },
        { status: 403 }
      );
    }
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  if (managedRole && parsed.data.role !== undefined) {
    return NextResponse.json({ error: "Only an Admin can change an employee's role" }, { status: 403 });
  }

  return applyUpdate(user.id, parsed.data);
}

async function applyUpdate(userId: string, data: z.infer<typeof updateSchema>) {
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.username !== undefined) updateData.username = data.username;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.phone !== undefined) updateData.phone = data.phone || null;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.newPassword) updateData.passwordHash = await bcrypt.hash(data.newPassword, 10);

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
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

    return NextResponse.json({ success: true, user: updated });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "This email is already in use" }, { status: 409 });
    }
    throw e;
  }
}

// DELETE /api/users/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_USERS")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  if (session.user.id === params.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  try {
    // Delete user from DB
    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    // Handling foreign key constraint failure
    return NextResponse.json({ error: "This employee cannot be deleted because they have leads or activities recorded under their name. Deactivate the account instead of deleting it." }, { status: 400 });
  }
}
