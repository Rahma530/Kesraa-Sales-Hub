-- TeleSalesData: raw, self-collected contacts a Tele-Sales employee has
-- gathered herself (separate entity from Lead — never converts into one).

CREATE TABLE "TeleSalesData" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "storeUrl" TEXT,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "meetingHeld" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" TIMESTAMP(3),
    "comment" TEXT,
    "comment2" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeleSalesData_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeleSalesData_ownerId_phone_key" ON "TeleSalesData"("ownerId", "phone");
CREATE INDEX "TeleSalesData_ownerId_idx" ON "TeleSalesData"("ownerId");

ALTER TABLE "TeleSalesData" ADD CONSTRAINT "TeleSalesData_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeleSalesData" ADD CONSTRAINT "TeleSalesData_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
