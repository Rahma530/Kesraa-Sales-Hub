import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, teamRoleForManager } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { generateInviteToken, getInviteExpiry, buildInviteLink } from "@/lib/invite-token";

// POST /api/users/[id]/resend-invite — regenerate an invite link for an
// employee who hasn't activated their account yet (Admin, or a Head for
// someone in their own team).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_TEAM_USERS")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const managedRole = teamRoleForManager(session.user.role);
  if (managedRole && user.role !== managedRole) {
    return NextResponse.json(
      { error: "You can only manage employees in your own team" },
      { status: 403 }
    );
  }

  if (user.passwordHash) {
    return NextResponse.json(
      { error: "This account is already active and has its own password." },
      { status: 400 }
    );
  }

  const inviteToken = generateInviteToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      inviteToken,
      inviteTokenExpiresAt: getInviteExpiry(),
    },
  });

  const inviteLink = buildInviteLink(inviteToken, req.nextUrl.origin);
  return NextResponse.json({ success: true, inviteLink });
}
