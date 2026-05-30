
## 2026-05-24 Scalability Audit Addendum

KaffePOS is ready for small-to-medium production workloads with current PostgreSQL indexes, modular routes, request IDs, and documented backups. Future scale work should be demand-driven:

- Introduce Redis/BullMQ only when email/report/webhook workloads exceed in-process job capacity.
- Add read replicas only after database CPU/read IOPS justify them.
- Move private exports/invoices/uploads to object storage with signed access before file volume growth.
- Add archive/reporting tables only when transaction history size impacts live POS latency.
