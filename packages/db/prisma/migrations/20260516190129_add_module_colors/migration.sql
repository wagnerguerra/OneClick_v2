-- CreateTable
CREATE TABLE "module_colors" (
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "module_colors_pkey" PRIMARY KEY ("slug")
);
