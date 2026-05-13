# KaffePOS RFC Index

RFC adalah dokumen keputusan untuk perubahan besar produk atau teknis. Gunakan RFC sebelum mengubah scope, user journey, data model, API contract, payment, subscription, offline sync, printer, auth, release gate, atau keputusan arsitektur yang sulit dibalik.

## Status

- `Draft`: sedang ditulis, belum boleh jadi dasar implementasi final.
- `Accepted`: disetujui menjadi dasar implementasi.
- `Superseded`: digantikan RFC lain.
- `Rejected`: tidak dipakai.

## Daftar RFC

| RFC | Status | Judul |
| --- | --- | --- |
| [0001](0001-product-scope-and-architecture.md) | Accepted | Product Scope and Architecture Guardrails |
| [0002](0002-commercial-readiness-hardening.md) | Accepted | Commercial Readiness Hardening Plan |
| [0003](0003-closed-beta-consolidation-and-integrations.md) | Accepted | Closed Beta Consolidation, Safe Update, and Integrations |

## Kapan Wajib Membuat RFC

RFC wajib dibuat untuk:

- Fitur baru yang mengubah flow utama POS, inventory, report, subscription, auth, payment, atau printer.
- Perubahan database schema yang mengubah kontrak data bisnis.
- Perubahan API yang memengaruhi web, APK, atau integrasi smoke test.
- Perubahan release gate, readiness score, pricing, plan, entitlement, atau commercial policy.
- Perubahan strategi offline/sync atau conflict resolution.
- Perubahan provider infrastruktur, payment, email, AI, analytics, atau monitoring.

RFC tidak wajib untuk:

- Bug fix kecil tanpa perubahan behavior publik.
- Copywriting minor.
- Refactor internal yang tidak mengubah kontrak API/data.
- Test tambahan untuk behavior yang sudah disepakati.

## Template Singkat

```md
# RFC 000X: Judul

Status: Draft
Tanggal: YYYY-MM-DD
Owner: Nama/role

## Ringkasan

## Masalah

## Goals

## Non-Goals

## Proposal

## Alternatif

## Dampak Produk

## Dampak Teknis

## Risiko

## Rollout dan Validasi

## Open Questions
```
