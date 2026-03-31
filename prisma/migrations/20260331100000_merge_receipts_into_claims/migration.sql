-- Migrate Receipt data into Claim table
-- Receipt.uploaded_by is a User ID; Claim.employee_id needs an Employee ID
-- Join through User.employee_id to resolve this

INSERT INTO "Claim" (
  "id", "firm_id", "employee_id", "claim_date", "merchant", "description",
  "receipt_number", "amount", "category_id", "confidence", "status", "approval",
  "payment_status", "rejection_reason", "file_url", "file_download_url",
  "thumbnail_url", "submitted_via", "type", "created_at", "updated_at"
)
SELECT
  r."id",
  r."firm_id",
  u."employee_id",
  r."receipt_date",
  r."merchant",
  NULL,
  r."receipt_number",
  r."amount",
  r."category_id",
  r."confidence"::"text"::"Confidence",
  'pending_review'::"ClaimStatus",
  r."approval"::"text"::"ApprovalStatus",
  'unpaid'::"PaymentStatus",
  NULL,
  r."file_url",
  r."file_download_url",
  r."thumbnail_url",
  r."submitted_via"::"text"::"SubmittedVia",
  'receipt'::"ClaimType",
  r."created_at",
  r."updated_at"
FROM "Receipt" r
JOIN "User" u ON u."id" = r."uploaded_by"
WHERE u."employee_id" IS NOT NULL;

-- Drop the Receipt table
DROP TABLE "Receipt";
