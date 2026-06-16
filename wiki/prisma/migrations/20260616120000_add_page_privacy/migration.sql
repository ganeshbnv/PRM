-- AlterTable: Add isPrivate column to Page
ALTER TABLE "Page" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: PageAccess
CREATE TABLE "PageAccess" (
    "id" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "PageAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageAccess_pageId_userId_key" ON "PageAccess"("pageId", "userId");
CREATE INDEX "PageAccess_pageId_idx" ON "PageAccess"("pageId");

-- AddForeignKey
ALTER TABLE "PageAccess" ADD CONSTRAINT "PageAccess_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageAccess" ADD CONSTRAINT "PageAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
