-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "merchant" TEXT NOT NULL,
    "canonical_merchant" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "memo" TEXT,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_navs" (
    "id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "nav_date" DATE NOT NULL,
    "nav" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "fund_navs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holdings" (
    "id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "units" DECIMAL(14,4) NOT NULL,
    "purchase_date" DATE NOT NULL,
    "purchase_nav" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_date_idx" ON "transactions"("date");

-- CreateIndex
CREATE INDEX "transactions_category_idx" ON "transactions"("category");

-- CreateIndex
CREATE INDEX "transactions_canonical_merchant_idx" ON "transactions"("canonical_merchant");

-- CreateIndex
CREATE INDEX "transactions_merchant_idx" ON "transactions"("merchant");

-- CreateIndex
CREATE INDEX "transactions_date_category_idx" ON "transactions"("date", "category");

-- CreateIndex
CREATE INDEX "funds_name_idx" ON "funds"("name");

-- CreateIndex
CREATE INDEX "fund_navs_fund_id_nav_date_idx" ON "fund_navs"("fund_id", "nav_date");

-- CreateIndex
CREATE INDEX "fund_navs_nav_date_idx" ON "fund_navs"("nav_date");

-- CreateIndex
CREATE UNIQUE INDEX "fund_navs_fund_id_nav_date_key" ON "fund_navs"("fund_id", "nav_date");

-- CreateIndex
CREATE INDEX "holdings_fund_id_idx" ON "holdings"("fund_id");

-- AddForeignKey
ALTER TABLE "fund_navs" ADD CONSTRAINT "fund_navs_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
