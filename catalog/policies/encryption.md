# Encryption policy

## Purpose

This policy sets how {{organization}} uses encryption to protect data and manages the keys and secrets involved.

## Data in transit

- Data sent over public networks is encrypted with current TLS. Plaintext protocols are not exposed publicly.
- Administrative access to systems uses encrypted channels only.

## Data at rest

- Data stores that hold confidential or customer data are encrypted at rest, using the provider's managed encryption where available.
- Backups are encrypted to the same standard as the data they copy.
- Devices that reach {{organization}}'s systems use full-disk encryption.

## Keys and secrets

- Keys, tokens and passwords are held in managed custody (a secret manager, the hosting platform's secret store or an approved password manager), never in source code or documents.
- Each secret has a named custodian. Issuing, rotating and revoking a secret is recorded.
- Secrets are rotated on the schedule the owner sets and immediately when a holder leaves or a compromise is suspected.

## Exceptions

An exception requires the security owner's written approval and a recorded review date.
