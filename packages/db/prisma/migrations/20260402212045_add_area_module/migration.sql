-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('DIRECT', 'INDIRECT');

-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "code" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "available_for_hiring" BOOLEAN NOT NULL DEFAULT false,
    "show_in_org_chart" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "leader_id" TEXT,
    "parent_id" TEXT,
    "cost_type" "CostType" NOT NULL DEFAULT 'DIRECT',
    "cost_weight" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "exclude_from_costing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
