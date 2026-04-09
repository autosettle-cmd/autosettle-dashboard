# Autosettle System Diagrams (Mermaid)

Paste each diagram into Excalidraw via: Menu → Insert → Mermaid

---

## 1. System Overview — Portals & Roles

```mermaid
flowchart TB
    subgraph Users
        EMP[Employee]
        ADM[Admin]
        ACC[Accountant]
        WA[WhatsApp User]
    end

    subgraph Portals
        EP[Employee Portal]
        AP[Admin Portal]
        ACP[Accountant Portal]
        WAB[WhatsApp Bot]
    end

    subgraph External
        GD[Google Drive]
        GEM[Gemini AI OCR]
        WAPI[WhatsApp Business API]
    end

    subgraph Database
        PG[(PostgreSQL)]
    end

    EMP --> EP
    ADM --> AP
    ACC --> ACP
    WA --> WAB

    EP --> PG
    AP --> PG
    ACP --> PG
    WAB --> PG

    WAB --> WAPI
    WAB --> GEM
    EP --> GD
    AP --> GD
    ACP --> GD
    WAB --> GD

    ACC -.->|manages multiple| AP
```

---

## 2. Admin Portal Pages

```mermaid
flowchart LR
    subgraph Admin Portal
        D[Dashboard]
        CL[Claims]
        INV[Invoices]
        AG[Invoice Aging]
        SUP[Suppliers]
        SOA[Supplier SOA]
        EMP[Employees]
        CAT[Categories]
        BR[Bank Recon]
        BRD[Bank Recon Detail]
        COA[Chart of Accounts]
        FP[Fiscal Periods]
        TX[Tax Codes]
        AL[Audit Log]
    end

    D --> CL
    D --> INV
    D --> BR
    INV --> AG
    SUP --> SOA
    BR --> BRD
```

---

## 3. Accountant Portal Pages

```mermaid
flowchart LR
    subgraph Accountant Portal
        D[Dashboard]
        CLI[Clients / Firms]
        ADM[Admins]
        CL[Claims]
        INV[Invoices]
        AG[Invoice Aging]
        SUP[Suppliers]
        SOA[Supplier SOA]
        EMP[Employees]
        CAT[Categories]
        BR[Bank Recon]
        BRD[Bank Recon Detail]
        COA[Chart of Accounts]
        JE[Journal Entries]
        GL[General Ledger]
        FP[Fiscal Periods]
        AL[Audit Log]
    end

    D --> CLI
    D --> CL
    D --> INV
    D --> BR
    CLI --> ADM
    INV --> AG
    SUP --> SOA
    BR --> BRD
    JE --> GL
```

---

## 4. Document → Approval → JV Flow

```mermaid
flowchart TD
    subgraph Input
        R[Receipt via WhatsApp/Upload]
        I[Invoice via WhatsApp/Upload]
        MC[Mileage Claim]
    end

    subgraph Admin Review
        PR[pending_review]
        PA[pending_approval]
        REJ1[rejected]
    end

    subgraph Accountant Approval
        APP[approved]
        REJ2[rejected]
    end

    subgraph Accounting
        JV[Journal Voucher Created]
        GL[General Ledger Updated]
    end

    R --> PR
    I --> PR
    MC --> PR

    PR -->|Admin reviews| PA
    PR -->|Admin rejects| REJ1

    PA -->|Accountant approves + selects GL account| APP
    PA -->|Accountant rejects| REJ2

    APP --> JV
    JV --> GL
```

---

## 5. Bank Reconciliation Flow

```mermaid
flowchart TD
    PDF[Upload Bank Statement PDF]
    PARSE[Parse PDF — Maybank regex]
    DEDUP{Overlapping transactions?}
    SKIP[Skip duplicates]
    CREATE[Create BankStatement + new transactions]

    subgraph Auto-Match 3 Passes
        P1[Pass 1: Reference match]
        P2[Pass 2: Amount + Date match]
        P3[Pass 3: Supplier name match]
    end

    subgraph Manual Actions
        MM[Manual match to payment]
        PV[Create Payment Voucher]
        OR[Create Official Receipt]
        EX[Exclude with notes]
    end

    CONFIRM[Confirm match]
    JV[Journal Voucher Created]

    PDF --> PARSE
    PARSE --> DEDUP
    DEDUP -->|Yes| SKIP
    DEDUP -->|No| CREATE
    SKIP --> CREATE
    CREATE --> P1
    P1 --> P2
    P2 --> P3

    P3 -->|unmatched| MM
    P3 -->|unmatched| PV
    P3 -->|unmatched| OR
    P3 -->|unmatched| EX
    P3 -->|matched suggestion| CONFIRM

    MM --> CONFIRM
    PV --> CONFIRM
    OR --> CONFIRM
    CONFIRM --> JV
```

---

## 6. WhatsApp Bot Flow

```mermaid
flowchart TD
    MSG[WhatsApp Message Received]
    DET{Detect Role}

    subgraph Admin Path
        ATYPE{Message Type?}
        AREC[Receipt Photo/PDF]
        AINV[Invoice Photo/PDF]
        AMIL[Mileage Claim]
    end

    subgraph Employee Path
        ETYPE{Message Type?}
        EREC[Receipt Photo/PDF]
        EMIL[Mileage Claim]
    end

    OCR[Gemini AI OCR Extract]
    DRIVE[Upload to Google Drive]
    DB[Create Record in DB]
    REPLY[WhatsApp Confirmation Reply]

    MSG --> DET
    DET -->|Admin phone| ATYPE
    DET -->|Employee phone| ETYPE

    ATYPE -->|Photo/PDF| AREC
    ATYPE -->|Invoice keyword| AINV
    ATYPE -->|Mileage keyword| AMIL

    ETYPE -->|Photo/PDF| EREC
    ETYPE -->|Mileage keyword| EMIL

    AREC --> OCR
    AINV --> OCR
    EREC --> OCR

    AMIL --> DB
    EMIL --> DB

    OCR --> DRIVE
    DRIVE --> DB
    DB --> REPLY
```

---

## 7. Payment & Set-Off Flow

```mermaid
flowchart TD
    subgraph Sources
        BRD[Bank Recon — Debit transaction]
        BRC[Bank Recon — Credit transaction]
        MAN[Manual creation]
    end

    PV[Payment Voucher]
    OR[Official Receipt]
    SI[Sales Invoice]

    subgraph Set-Off
        ALLOC[Allocate payment to invoices]
        BAL{Fully allocated?}
        PART[Partial — remaining balance]
        FULL[Fully set off]
    end

    SUP[Supplier Balance Updated]

    BRD --> PV
    BRC --> OR
    BRC --> SI
    MAN --> PV
    MAN --> OR

    PV --> ALLOC
    OR --> ALLOC
    ALLOC --> BAL
    BAL -->|No| PART
    BAL -->|Yes| FULL
    PART --> SUP
    FULL --> SUP
```

---

## 8. Data Model — Key Tables

```mermaid
erDiagram
    Firm ||--o{ User : has
    Firm ||--o{ Supplier : has
    Firm ||--o{ BankStatement : has
    Firm ||--o{ Payment : has
    Firm ||--o{ JournalEntry : has

    User ||--o{ Receipt : submits
    User ||--o{ Claim : submits

    Supplier ||--o{ Invoice : has
    Supplier ||--o{ SalesInvoice : has

    BankStatement ||--o{ BankTransaction : contains
    BankTransaction |o--o| Payment : matched_to

    Payment ||--o{ PaymentAllocation : has
    Invoice ||--o{ PaymentAllocation : receives

    JournalEntry ||--o{ JournalLine : has
    JournalLine }o--|| GLAccount : posts_to

    GLAccount ||--o{ GLAccount : parent_child
```
