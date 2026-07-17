-- CreateTable
CREATE TABLE "PerformanceMeeting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PerformanceMeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMeetingNote" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceMeetingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMeetingAttachment" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceMeetingAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMeetingLog" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceMeetingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformanceMeeting_tenantId_date_idx" ON "PerformanceMeeting"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceMeetingParticipant_meetingId_userId_key" ON "PerformanceMeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "PerformanceMeetingNote_meetingId_idx" ON "PerformanceMeetingNote"("meetingId");

-- CreateIndex
CREATE INDEX "PerformanceMeetingAttachment_meetingId_idx" ON "PerformanceMeetingAttachment"("meetingId");

-- CreateIndex
CREATE INDEX "PerformanceMeetingLog_meetingId_idx" ON "PerformanceMeetingLog"("meetingId");

-- AddForeignKey
ALTER TABLE "PerformanceMeeting" ADD CONSTRAINT "PerformanceMeeting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMeeting" ADD CONSTRAINT "PerformanceMeeting_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMeeting" ADD CONSTRAINT "PerformanceMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMeetingParticipant" ADD CONSTRAINT "PerformanceMeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PerformanceMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMeetingParticipant" ADD CONSTRAINT "PerformanceMeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMeetingNote" ADD CONSTRAINT "PerformanceMeetingNote_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PerformanceMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMeetingNote" ADD CONSTRAINT "PerformanceMeetingNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMeetingAttachment" ADD CONSTRAINT "PerformanceMeetingAttachment_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PerformanceMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMeetingAttachment" ADD CONSTRAINT "PerformanceMeetingAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMeetingLog" ADD CONSTRAINT "PerformanceMeetingLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "PerformanceMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMeetingLog" ADD CONSTRAINT "PerformanceMeetingLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
