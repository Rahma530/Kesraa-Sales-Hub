import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "HEAD_OF_SALES" && session.user.role !== "HEAD_OF_TELE_SALES")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { leadIds, employeeId } = await req.json();
    
    if (!leadIds || !Array.isArray(leadIds) || !employeeId) {
      return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
    }

    if (employeeId === "AUTO") {
      const teleSalesEmployees = await prisma.user.findMany({
        where: { role: "TELE_SALES" }
      });
      if (teleSalesEmployees.length === 0) {
        return NextResponse.json({ error: "No Tele-Sales employees available to distribute leads to" }, { status: 400 });
      }

      // Distribute leads evenly using round-robin logic
      const updates: any[] = [];
      const activitiesToCreate: any[] = [];
      const notificationsToCreate: any[] = [];

      teleSalesEmployees.forEach((emp, index) => {
        // Get leads for this specific employee
        const assignedLeadIds = leadIds.filter((_: any, i: number) => i % teleSalesEmployees.length === index);
        if (assignedLeadIds.length === 0) return;
        
        updates.push(prisma.lead.updateMany({
          where: { id: { in: assignedLeadIds } },
          data: { assignedToId: emp.id, currentStage: "TELE_SALES" }
        }));

        assignedLeadIds.forEach((id: string) => {
          activitiesToCreate.push({
            leadId: id,
            userId: session.user.id,
            type: "LEAD_ASSIGNED",
            message: `Lead assigned to ${emp.name}`,
          });
        });

        notificationsToCreate.push({
          userId: emp.id,
          title: "New leads",
          message: `${assignedLeadIds.length} new leads have been assigned to you`,
          type: "ASSIGNMENT",
          link: "?status=NEW",
        });
      });

      if (activitiesToCreate.length > 0) {
        updates.push(prisma.activity.createMany({ data: activitiesToCreate }));
      }
      if (notificationsToCreate.length > 0) {
        updates.push(prisma.notification.createMany({ data: notificationsToCreate }));
      }

      await prisma.$transaction(updates);
      return NextResponse.json({ success: true, auto: true });
    }

    // Check if employee exists
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // If assigned to SALES, we might want to change status to TRANSFERRED_TO_SALES
    const updateData: any = {
      assignedToId: employeeId,
      currentStage: employee.role,
    };

    if (employee.role === "SALES") {
      updateData.status = "TRANSFERRED_TO_SALES";
    }

    const updates = [
      prisma.lead.updateMany({
        where: { id: { in: leadIds } },
        data: updateData,
      }),
      prisma.activity.createMany({
        data: leadIds.map((id: string) => ({
          leadId: id,
          userId: session.user.id,
          type: "LEAD_ASSIGNED",
          message: `Lead assigned to ${employee.name}`,
        })),
      }),
      prisma.notification.create({
        data: {
          userId: employeeId,
          title: "New leads",
          message: `${leadIds.length} leads have been transferred to you`,
          type: "ASSIGNMENT",
          link: "?status=NEW",
        },
      }),
    ];

    await prisma.$transaction(updates);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Bulk assign error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
