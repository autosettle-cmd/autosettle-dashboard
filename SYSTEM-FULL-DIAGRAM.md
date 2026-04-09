# Full System Diagram

Copy everything below (without this header) into Excalidraw Mermaid import:

```
flowchart TB
    %% ─── Entry Points ───
    LOGIN[Login Page]
    LOGIN -->|admin| ADMIN_DASH
    LOGIN -->|accountant| ACC_DASH
    LOGIN -->|employee| EMP_DASH
    WAAPI[WhatsApp Business API] -->|message in| WA_BOT

    %% ─── WhatsApp Bot ───
    subgraph WhatsApp Bot
        WA_BOT[Receive Message]
        WA_ROLE{Detect Role}
        WA_OCR[Gemini AI OCR]
        WA_MILE[Mileage Step Flow]
        WA_BOT --> WA_ROLE
        WA_ROLE -->|photo/pdf| WA_OCR
        WA_ROLE -->|mileage keyword| WA_MILE
    end

    WA_OCR -->|receipt| REC_DB[(Receipt Created)]
    WA_OCR -->|invoice| INV_DB[(Invoice Created)]
    WA_MILE --> CLAIM_DB[(Claim Created)]

    %% ─── Employee Portal ───
    subgraph Employee Portal
        EMP_DASH[Employee Dashboard]
        EMP_CLAIMS[My Claims]
        EMP_DASH --> EMP_CLAIMS
    end

    EMP_CLAIMS -->|submit| CLAIM_DB

    %% ─── Admin Portal ───
    subgraph Admin Portal
        ADMIN_DASH[Admin Dashboard]
        ADMIN_CLAIMS[Claims Review]
        ADMIN_INV[Invoices Review]
        ADMIN_INV_AGE[Invoice Aging]
        ADMIN_SUP[Suppliers]
        ADMIN_SOA[Supplier SOA]
        ADMIN_EMP[Employees]
        ADMIN_CAT[Categories]
        ADMIN_BR[Bank Recon]
        ADMIN_BRD[Bank Recon Detail]
        ADMIN_COA[Chart of Accounts]
        ADMIN_FP[Fiscal Periods]
        ADMIN_TX[Tax Codes]
        ADMIN_AL[Audit Log]

        ADMIN_DASH --> ADMIN_CLAIMS
        ADMIN_DASH --> ADMIN_INV
        ADMIN_DASH --> ADMIN_BR
        ADMIN_INV --> ADMIN_INV_AGE
        ADMIN_SUP --> ADMIN_SOA
        ADMIN_BR --> ADMIN_BRD
    end

    %% ─── Accountant Portal ───
    subgraph Accountant Portal
        ACC_DASH[Accountant Dashboard]
        ACC_CLIENTS[Clients / Firms]
        ACC_ADMINS[Admins]
        ACC_CLAIMS[Claims Approval]
        ACC_INV[Invoices Approval]
        ACC_INV_AGE[Invoice Aging]
        ACC_SUP[Suppliers]
        ACC_SOA[Supplier SOA]
        ACC_EMP[Employees]
        ACC_CAT[Categories]
        ACC_BR[Bank Recon]
        ACC_BRD[Bank Recon Detail]
        ACC_COA[Chart of Accounts]
        ACC_JE[Journal Entries]
        ACC_GL[General Ledger]
        ACC_FP[Fiscal Periods]
        ACC_AL[Audit Log]

        ACC_DASH --> ACC_CLIENTS
        ACC_DASH --> ACC_CLAIMS
        ACC_DASH --> ACC_INV
        ACC_DASH --> ACC_BR
        ACC_CLIENTS --> ACC_ADMINS
        ACC_INV --> ACC_INV_AGE
        ACC_SUP --> ACC_SOA
        ACC_BR --> ACC_BRD
        ACC_JE --> ACC_GL
    end

    %% ─── Document Approval Flow ───
    subgraph Approval Flow
        PENDING_REV[pending_review]
        PENDING_APP[pending_approval]
        APPROVED[approved]
        REJECTED[rejected]

        PENDING_REV -->|Admin reviews| PENDING_APP
        PENDING_REV -->|Admin rejects| REJECTED
        PENDING_APP -->|Accountant approves| APPROVED
        PENDING_APP -->|Accountant rejects| REJECTED
    end

    REC_DB --> PENDING_REV
    INV_DB --> PENDING_REV
    CLAIM_DB --> PENDING_REV

    ADMIN_CLAIMS -->|review| PENDING_REV
    ADMIN_INV -->|review| PENDING_REV
    ACC_CLAIMS -->|approve| PENDING_APP
    ACC_INV -->|approve| PENDING_APP

    %% ─── Bank Reconciliation Flow ───
    subgraph Bank Recon Flow
        BR_UPLOAD[Upload Bank PDF]
        BR_PARSE[Parse Maybank PDF]
        BR_DEDUP{Dedup Check}
        BR_SKIP[Skip Duplicates]
        BR_CREATE[Create Transactions]
        BR_AUTO[Auto-Match 3 Passes]
        BR_MANUAL[Manual Match]
        BR_PV[Create Payment Voucher]
        BR_OR[Create Official Receipt]
        BR_EXCLUDE[Exclude]
        BR_CONFIRM[Confirm Match]

        BR_UPLOAD --> BR_PARSE
        BR_PARSE --> BR_DEDUP
        BR_DEDUP -->|duplicates found| BR_SKIP
        BR_DEDUP -->|new| BR_CREATE
        BR_SKIP --> BR_CREATE
        BR_CREATE --> BR_AUTO
        BR_AUTO -->|unmatched| BR_MANUAL
        BR_AUTO -->|unmatched| BR_PV
        BR_AUTO -->|unmatched| BR_OR
        BR_AUTO -->|unmatched| BR_EXCLUDE
        BR_AUTO -->|matched| BR_CONFIRM
        BR_MANUAL --> BR_CONFIRM
    end

    ADMIN_BRD --> BR_UPLOAD
    ACC_BRD --> BR_UPLOAD

    %% ─── Payment & Set-Off ───
    subgraph Payment Flow
        PAY_VOUCHER[Payment Voucher]
        OFF_RECEIPT[Official Receipt]
        SALES_INV[Sales Invoice]
        ALLOC[Allocate to Invoices]
        SUP_BAL[Supplier Balance Updated]

        PAY_VOUCHER --> ALLOC
        OFF_RECEIPT --> ALLOC
        ALLOC --> SUP_BAL
    end

    BR_PV --> PAY_VOUCHER
    BR_OR --> OFF_RECEIPT
    BR_OR --> SALES_INV

    %% ─── Accounting Output ───
    subgraph Accounting
        JV[Journal Voucher]
        GL[General Ledger]
        JV --> GL
    end

    APPROVED -->|creates JV + GL selection| JV
    BR_CONFIRM -->|creates JV| JV
    ACC_JE --> JV
    ACC_GL --> GL

    SUP_BAL --> ACC_SOA
    SUP_BAL --> ADMIN_SOA

    %% ─── External Services ───
    subgraph External
        DRIVE[Google Drive]
        GEMINI[Gemini AI]
        PG[(PostgreSQL)]
    end

    WA_OCR --> GEMINI
    WA_OCR --> DRIVE
    BR_UPLOAD --> DRIVE
    REC_DB --> PG
    INV_DB --> PG
    CLAIM_DB --> PG
    JV --> PG
```
