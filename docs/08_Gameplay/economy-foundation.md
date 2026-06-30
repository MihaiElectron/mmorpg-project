# Economy Foundation - Implementation Specification

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-27
- Depends on: docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md, docs/01_Architecture/adr/ADR-0007-auction-house-authority.md, docs/08_Gameplay/settlement-specifications.md, docs/08_Gameplay/settlement-mvp-slicing.md, docs/08_Gameplay/auction-house-specifications.md
- Used by: Project owner, gameplay design, backend developers, DevTools developers, repository-aware coding agents

## Scope

This document specifies the Economy Foundation required before implementing
player-visible economy features.

It is documentation only. It does not create runtime code, migrations,
controllers, services, DTOs, frontend components, DevTools panels, or database
tables.

The Economy Foundation is the shared server-authoritative layer used by:

- Auction House;
- Craft Orders;
- NPC Vendors;
- monetary loot;
- quests;
- rewards;
- taxes;
- Treasury;
- player-to-player trade;
- guilds;
- future banks.

The goal is one robust model for wallet balances, transactions, ledger audit,
idempotency, rollback, and future extensions.

## 1. Currency Model

The official currency denominations are:

- bronze;
- silver;
- gold.

Conversion rules:

- bronze is the minimum indivisible unit;
- `1 silver = 100 bronze`;
- `1 gold = 100 silver = 10 000 bronze`.

Storage and server rules:

- all server monetary values are bronze-only;
- all database monetary values are bronze-only;
- all comparisons, sorting, taxes, bids, rewards, refunds, and transfers use
  bronze;
- UI may display gold/silver/bronze, but this conversion is display-only;
- business tables must not store split denomination columns such as
  `amountGold`, `amountSilver`, `amountBronze` together;
- PostgreSQL `BIGINT` or an equivalent 64-bit integer is recommended for all
  persisted monetary values;
- TypeScript implementation must explicitly account for safe integer limits
  when manipulating large balances.

Expected field names:

- `amountBronze`;
- `balanceBronze`;
- `availableBalanceBronze`;
- `reservedBalanceBronze`;
- `priceBronze`;
- `buyoutPriceBronze`;
- `currentBidBronze`;
- `taxAmountBronze`;
- `treasuryBalanceBronze`.

## 2. Wallet

A Wallet is the canonical holder of spendable currency.

### 2.1 Ownership

MVP implementation target:

- one Character owns one Wallet.

Future compatible owners:

- settlement Treasury;
- bank account;
- guild;
- NPC vendor account if needed for accounting;
- system sink/source account;
- admin adjustment account.

Each Wallet has exactly one owner identity. Owner type and owner id must be
unambiguous.

### 2.2 Fields

Functional fields:

- wallet id;
- owner type;
- owner id;
- `balanceBronze`;
- optional `reservedBalanceBronze` if holds are represented on the wallet;
- status;
- creation timestamp;
- update timestamp;
- optional metadata for support/debug context.

`balanceBronze` represents the authoritative current balance according to the
selected ledger reconciliation strategy. If the implementation stores both
current balance and ledger history, they must remain reconcilable.

### 2.3 Invariants

- A Wallet cannot have a negative `balanceBronze`.
- A Wallet cannot spend more than its available balance.
- Available balance excludes committed reservations or holds.
- A Wallet belongs to exactly one owner.
- A Character cannot have two active primary Wallets.
- Wallet ownership cannot be silently transferred.
- Currency cannot be created by editing a Wallet directly.
- Currency cannot be destroyed by editing a Wallet directly.
- Every Wallet balance change must correspond to an Economic Transaction and
  Ledger entries.
- Wallet status controls whether new operations are allowed.

### 2.4 Limits

Limits are policy values, not hardcoded design constants in this document.

Required policy decisions before production tuning:

- maximum `balanceBronze` for a Character Wallet;
- maximum `balanceBronze` for Treasury and Bank wallets;
- maximum single transaction `amountBronze`;
- maximum reserved balance per Wallet;
- behavior when an incoming credit would exceed the maximum.

Until those policy values are defined, implementation must reject overflow and
unsafe numeric operations.

### 2.5 Wallet Status

Suggested statuses:

- `Active`;
- `Frozen`;
- `Closed`;
- `Archived`.

Rules:

- `Active` Wallets can debit and credit if validations pass.
- `Frozen` Wallets reject player-initiated debits and credits unless an admin
  support flow explicitly allows a controlled resolution.
- `Closed` Wallets reject normal economy operations.
- `Archived` Wallets are read-only history.

## 3. Economic Transaction

An Economic Transaction is the authoritative record of one economic operation.

It groups validation intent, account movement, ledger entries, idempotency, and
audit into one functional unit.

### 3.1 Fields

Functional fields:

- transaction id;
- type;
- source Wallet or system source;
- destination Wallet or system destination;
- `amountBronze`;
- status;
- createdAt;
- updatedAt;
- committedAt if applied;
- idempotency key if command-driven;
- actor id if player/admin initiated;
- correlation id for linked domain operation;
- metadata if needed for domain context.

Metadata examples:

- auction listing id;
- item id;
- quest id;
- NPC vendor id;
- craft order id;
- treasury id;
- tax rule id;
- admin reason.

Metadata must support audit and debugging without becoming the source of
business authority.

### 3.2 Lifecycle

```text
Requested
└── Validating
    ├── Rejected
    └── Reserved
        ├── Applied
        ├── RolledBack
        └── Failed
            └── RequiresReview
```

State meanings:

| State | Meaning | Balance effect |
|---|---|---|
| Requested | Command or system event created an intent | None |
| Validating | Server checks actor, wallets, amount, status, and idempotency | None |
| Rejected | Validation failed before balance effect | None |
| Reserved | Required funds or assets are held for the operation | Hold only |
| Applied | Ledger entries and Wallet changes are complete | Final effect |
| RolledBack | Reserved operation was safely reversed before final effect | Reversal/hold release |
| Failed | Operation could not finish cleanly | No silent success |
| RequiresReview | Support/admin resolution is required | Frozen/pending |

For simple immediate transfers, implementation may combine validation,
reservation, and apply inside one atomic operation while still exposing the same
logical lifecycle in audit.

### 3.3 Transaction Sources and Destinations

Source and destination can be:

- Wallet;
- system source;
- system sink;
- escrow/hold;
- Treasury Wallet;
- future Bank Wallet;
- future Guild Wallet.

Rules:

- debits require an owned or system-authorized source;
- credits require a valid destination;
- source and destination must be explicit;
- system-created currency must use approved transaction types;
- sinks must be explicit and auditable.

## 4. Transaction Types

Initial and future-compatible transaction types:

| Type | Direction | Purpose |
|---|---|---|
| `LOOT` | System source -> Character Wallet | Monetary loot reward |
| `QUEST` | System source -> Character Wallet | Quest reward |
| `AUCTION_BUY` | Buyer Wallet -> `auction_escrow` system wallet | Buyer payment; escrow holds funds until seller claims money mail |
| `AUCTION_SELL` | `auction_escrow` system wallet -> Seller Wallet | Seller proceeds claimed via Mailbox money mail |
| `AUCTION_REFUND` | Auction escrow/hold -> Character Wallet | Future bid or failed purchase refund |
| `NPC_BUY` | Character Wallet -> NPC/system | Player buys from NPC |
| `NPC_SELL` | NPC/system -> Character Wallet | Player sells to NPC |
| `CRAFT_PAYMENT` | Character Wallet -> crafter/system | Craft service payment |
| `TAX` | Character/flow -> Treasury Wallet | Tax capture |
| `TREASURY` | Treasury Wallet -> target | Treasury spending or transfer |
| `PLAYER_TRADE` | Character Wallet -> Character Wallet | Player-to-player currency exchange |
| `GUILD` | Guild Wallet -> target or source -> Guild Wallet | Guild economic operation |
| `BANK` | Character Wallet <-> Bank Wallet | Future bank deposit/withdrawal |
| `ADMIN` | Admin-controlled source/sink/Wallet | Audited support correction |
| `REVERSAL` | Prior transaction counter-entry | Logical reversal |

Extension rules:

- new transaction types must be additive;
- a type must define allowed source and destination categories;
- a type must define whether it creates, transfers, reserves, releases, or
  destroys currency;
- a type must define audit metadata required for support;
- types must not bypass Wallet, Transaction, and Ledger invariants.

## 5. Ledger

The Ledger is the append-only economic journal.

Objectives:

- audit;
- anti-cheat investigation;
- DevTools inspection;
- player support history;
- rollback by logical reversal;
- reconciliation between Wallet balances and recorded movements;
- economy analytics;
- exploit detection.

### 5.1 Ledger Entry

Functional fields:

- ledger entry id;
- transaction id;
- Wallet id or system account reference;
- direction;
- `amountBronze`;
- resulting `balanceBronze` if stored;
- createdAt;
- entry type;
- metadata snapshot if needed.

Directions:

- `Debit`;
- `Credit`;
- `Reserve`;
- `Release`;
- `Reversal`.

Rules:

- Ledger entries are append-only.
- Applied entries are never silently edited.
- Corrections use a new reversing transaction or support resolution entry.
- Every applied Wallet balance change has at least one Ledger entry.
- A normal transfer creates balanced entries unless the type is an approved
  source or sink.
- Ledger reads must be paginated.

### 5.2 Reconciliation

The implementation must support reconciliation:

- Wallet current balance equals the expected result of applied ledger entries,
  plus any explicit reconciliation model selected later;
- reserved funds are visible and explainable;
- failed and rejected transactions do not produce final balance changes;
- admin corrections remain traceable.

## 6. Critical Invariants

Currency invariants:

- no currency is created outside approved source transaction types;
- no currency is destroyed outside approved sink transaction types;
- no Wallet balance can become negative;
- no reserved amount can be spent elsewhere;
- no transaction amount can be zero or negative unless a future explicit
  reversal model allows a signed representation;
- no transaction amount can overflow the supported integer range.

Transaction invariants:

- every economic operation is server-authoritative;
- every operation is atomic from the player-facing point of view;
- every applied transaction is immutable;
- every correction uses a new reversal or support transaction;
- every command-driven transaction is idempotent or rejects replay safely;
- every transaction has one clear type;
- every transaction has explicit source and destination semantics;
- every applied transaction has Ledger entries;
- every rejected transaction has no final balance effect.

Wallet invariants:

- one Character has one active Wallet;
- a Wallet belongs to one owner;
- Wallet direct balance edits are forbidden outside controlled migration or
  audited support procedures;
- frozen or closed Wallets reject normal player economic commands.

Ledger invariants:

- Ledger entries are append-only;
- Ledger entries preserve enough context for audit;
- Ledger entries do not contain client-authoritative values;
- Ledger entries can be searched by transaction, Wallet, actor, type, and time.

Cross-system invariants:

- Auction House, Craft Orders, NPC Vendors, loot, quests, rewards, taxes,
  Treasury, player trade, guilds, and banks must use Economy Foundation;
- frontend, DevTools, and Studio never implement independent economic rules;
- client display denominations never become persistence denominations.

## 7. Transaction Rules

### 7.1 Debit

A debit removes available bronze from a Wallet.

Rules:

- source Wallet exists;
- source Wallet status permits debit;
- `amountBronze` is positive;
- source available balance is sufficient;
- funds are not already reserved;
- operation is authorized for the actor and transaction type;
- debit is recorded in Ledger.

### 7.2 Credit

A credit adds bronze to a Wallet.

Rules:

- destination Wallet exists or is created by an approved flow;
- destination Wallet status permits credit;
- `amountBronze` is positive;
- credit does not overflow the destination balance limit;
- source is a valid Wallet, system source, or reversal;
- credit is recorded in Ledger.

### 7.3 Reservation

A reservation commits available funds to a purpose before final settlement.

Rules:

- reserved funds are unavailable for other operations;
- each reservation has one purpose;
- each reservation has one terminal outcome: apply, release, rollback, or
  support resolution;
- reservation release is idempotent;
- reservation apply is idempotent.

Reservations are required for future timed auction bids and may be used by
other delayed settlement flows.

### 7.4 Rollback and Reversal

Rollback means an operation failed before final application and all holds or
intermediate effects are released.

Reversal means an already applied transaction is corrected by a new transaction.

Rules:

- applied transactions are not deleted;
- applied transactions are not silently edited;
- reversal references the original transaction;
- reversal uses explicit metadata and reason;
- reversal cannot create duplicate refunds;
- rollback of a pending operation is idempotent.

### 7.5 Idempotence

Every client-command economic operation must have replay protection.

Idempotence requirements:

- same actor, same operation, same idempotency key returns the same committed
  result or a safe already-processed response;
- same key with incompatible payload is rejected;
- replay after terminal state does not duplicate debit, credit, refund, item
  transfer, or tax;
- idempotency records have a documented retention policy before production.

### 7.6 Concurrency and Locking

This document does not prescribe SQL syntax, but the functional locking rules
are mandatory.

Operations must protect:

- source Wallet;
- destination Wallet;
- reservations or holds;
- transaction record;
- ledger append;
- linked domain object when applicable.

Examples:

- Auction buy locks listing, item escrow, buyer Wallet, seller Wallet,
  transaction, and ledger path.
- Timed auction bid locks listing, bidder Wallet, prior winner hold, and
  current bid state.
- Tax capture locks taxable transaction and Treasury Wallet.

Concurrency result:

- one state transition wins;
- losing concurrent operations are rejected or return idempotent results;
- no double debit;
- no double credit;
- no negative balance;
- no invisible partial application.

## 8. State Machines

### 8.1 Wallet

```text
Active
├── Frozen
│   ├── Active
│   └── Closed
└── Closed
    └── Archived
```

Wallet state meanings:

| State | Meaning |
|---|---|
| Active | Normal economy operations allowed |
| Frozen | Normal player operations blocked; support/system resolution possible |
| Closed | No normal operations allowed |
| Archived | Read-only historical Wallet |

### 8.2 Economic Transaction

```text
Requested
└── Validating
    ├── Rejected
    └── Reserved
        ├── Applied
        ├── RolledBack
        └── Failed
            └── RequiresReview
```

Transaction terminal states:

- `Rejected`;
- `Applied`;
- `RolledBack`;
- `RequiresReview`.

`Failed` is not a final business state. It must be resolved into rollback,
apply, or review.

### 8.3 Ledger Entry

```text
Prepared
├── Appended
│   └── Archived
└── Rejected
```

Ledger entry state meanings:

| State | Meaning |
|---|---|
| Prepared | Entry is part of an in-progress operation and has no independent authority |
| Appended | Entry is committed to audit history |
| Rejected | Entry proposal was not committed |
| Archived | Entry remains immutable but is hidden from default active views |

An implementation may not persist `Prepared` if ledger append happens only at
commit time. The functional requirement is that no visible transaction can be
applied without committed ledger audit.

## 9. DevTools

DevTools supports inspection and controlled support workflows. It does not own
business rules.

### 9.1 Wallet Inspection

DevTools should expose:

- Wallet id;
- owner type and owner id;
- `balanceBronze`;
- reserved amount if present;
- status;
- recent transactions;
- recent ledger entries;
- reconciliation warnings;
- linked domain objects.

### 9.2 Transaction Inspection

DevTools should expose:

- transaction id;
- type;
- source;
- destination;
- `amountBronze`;
- status;
- actor;
- createdAt and committedAt;
- idempotency key hash or safe reference;
- metadata;
- linked ledger entries.

### 9.3 Ledger Inspection

DevTools should expose:

- paginated ledger search;
- filters by Wallet, transaction id, actor, type, status, time range, and
  amount range;
- before/after balance if stored;
- reversal links;
- support notes if present.

### 9.4 Audit and Support

Allowed DevTools actions:

- inspect Wallets;
- inspect transactions;
- inspect ledger entries;
- search and filter audit history;
- trigger approved support resolution commands if future implementation defines
  them.

Forbidden DevTools behavior:

- direct balance edits;
- direct ledger edits;
- hidden currency creation;
- hidden currency deletion;
- bypassing domain services;
- replacing server validations with UI checks.

## 10. Implementation Preparation

This section names probable future implementation concepts without creating
code.

### 10.1 Probable Entities

#### Wallet

Relationships:

- belongs to one owner;
- has many Economic Transactions as source or destination;
- has many Ledger Entries;
- may have many reservations or holds if represented separately.

Expected fields:

- id;
- ownerType;
- ownerId;
- `balanceBronze`;
- optional `reservedBalanceBronze`;
- status;
- createdAt;
- updatedAt;

#### EconomicTransaction

Relationships:

- references source Wallet or system source;
- references destination Wallet or system destination;
- has many Ledger Entries;
- references idempotency record if command-driven;
- references domain metadata by ids.

Expected fields:

- id;
- type;
- sourceType;
- sourceId;
- destinationType;
- destinationId;
- `amountBronze`;
- status;
- idempotencyKey;
- actorId;
- correlationId;
- metadata;
- createdAt;
- updatedAt;
- committedAt.

#### LedgerEntry

Relationships:

- belongs to one Economic Transaction;
- references one Wallet or system account;

Expected fields:

- id;
- transactionId;
- walletId or systemAccount;
- direction;
- `amountBronze`;
- resulting `balanceBronze` if stored;
- entryType;
- metadata;
- createdAt.

### 10.2 Expected Relations

```text
Character
└── Wallet
    ├── EconomicTransaction as source
    ├── EconomicTransaction as destination
    └── LedgerEntry

EconomicTransaction
├── LedgerEntry debit
├── LedgerEntry credit
└── Domain metadata
```

Future relations:

- Settlement Treasury uses Wallet;
- Bank account uses Wallet;
- Guild uses Wallet;
- Auction House listing references transaction ids;
- Craft Order references payment transaction ids;
- NPC Vendor operation references transaction ids.

### 10.3 Server Validations

Required validations:

- actor is authenticated when player-initiated;
- actor has permission for the transaction type;
- Wallet exists;
- Wallet owner matches expected actor or system;
- Wallet status permits operation;
- `amountBronze` is positive;
- `amountBronze` does not overflow;
- source available balance is sufficient;
- destination can receive credit;
- transaction type supports source/destination pair;
- idempotency key is valid for command-driven operation;
- metadata required by transaction type is present;
- linked domain object is in the expected state.

### 10.4 Critical Transactions

Critical flows to test first:

- Character Wallet creation;
- monetary loot credit;
- quest reward credit;
- Auction House fixed-price buy;
- Auction House seller credit;
- Auction House replayed buy request;
- NPC buy;
- NPC sell;
- craft payment debit;
- tax transfer to Treasury;
- admin correction with audit;
- reversal of an applied support transaction.

## 11. Diagrams

### 11.1 Loot

```text
Monster / reward source
└── LOOT transaction
    ├── System source
    └── Character Wallet
        └── Ledger
            ├── Credit amountBronze
            └── Audit metadata
```

### 11.2 Auction

```text
Auction House buyout
└── AUCTION_BUY transaction
    ├── Buyer Wallet debit
    ├── Seller Wallet credit
    └── Ledger
        ├── Debit buyer amountBronze
        ├── Credit seller amountBronze
        └── Listing metadata
```

### 11.3 NPC Vendor

```text
NPC buy / sell
├── NPC_BUY transaction
│   ├── Character Wallet debit
│   └── Ledger
└── NPC_SELL transaction
    ├── Character Wallet credit
    └── Ledger
```

### 11.4 Taxes

```text
Taxable operation
└── TAX transaction
    ├── Player or sale flow
    ├── Treasury Wallet
    └── Ledger
        ├── Debit taxable source
        ├── Credit treasuryBalanceBronze
        └── Tax metadata
```

### 11.5 Treasury

```text
Treasury Wallet
├── Tax credits
├── Maintenance spending
├── Building upgrades
└── Ledger
    ├── Treasury credit entries
    ├── Treasury debit entries
    └── Reversal/support entries
```

### 11.6 End-to-End Flow

```text
Domain intent
└── Economy validation
    ├── Reject
    └── Economic Transaction
        ├── Wallet locks / reservations
        ├── Ledger entries
        └── Applied result
            └── Domain state transition
```

## 12. Open Questions

- What maximum `balanceBronze` is accepted per Wallet owner type?
- Are Wallet balances stored directly, derived from Ledger, or stored with
  scheduled reconciliation?
- What is the idempotency retention window for economic commands?
- Are reservations represented as Wallet fields, separate hold records, or both?
- Which system source and sink accounts are required for MVP implementation?
- What DevTools support actions are allowed in the first implementation?
