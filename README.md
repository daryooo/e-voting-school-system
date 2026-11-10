# E-BOTO · CTU Online Voting System

E-BOTO is a responsive election portal for Cebu Technological University. The React interface is backed by a Node.js REST API and a persistent SQLite database. It includes student self-registration and admin sign-in, election setup, candidate photo uploads, voter eligibility, verification, anonymous voting, results, and an append-only audit trail.

## Run locally

Requirements: Node.js 22.5 or later.

```powershell
npm install
npm run server
```

In another terminal:

```powershell
npm run dev
```

Open the Vite URL shown in the terminal. For a production-style local run, use `npm run build`, then `npm run start`; the API server serves the built app on port 3001. Set `PORT` and `HOST` to configure the server address.

## Deploy to Render

The included `render.yaml` configures one Node.js web service that builds and serves both the app and API, with a persistent disk for the SQLite database and candidate photos.

1. Push or merge this repository to GitHub.
2. In Render, choose **New → Blueprint**, connect `daryooo/e-voting-school-system`, and select the `main` branch.
3. Before the first deploy, enter `EBOTO_ADMIN_EMAIL` and a unique, strong `EBOTO_ADMIN_PASSWORD` when prompted. These credentials initialize the first production admin; keep them private.
4. Review the service and persistent-disk cost, then create the Blueprint. When the deployment passes its health check, open its `onrender.com` URL.

The configured persistent disk requires a paid Render web-service plan. Do not remove the disk or change `EBOTO_DATA_DIR` after launch: the election database and uploaded candidate photos are stored there. Registration currently collects self-reported student information and does not verify CTU identity. Complete the institution’s identity-verification, backup, security, and election-readiness reviews before using the service for a real election.

## Demo accounts

The empty development database is seeded automatically:

| Role | Sign-in ID | Password |
|---|---|---|
| Admin | `admin@ctu.edu.ph` | `CtuAdmin!2026` |
| Student | `2026-0001` | `CtuStudent!2026` |
| Student (verification pending) | `2026-0002` | `CtuStudent!2026` |

Demo accounts are never created in production. To bootstrap the first production admin, set `NODE_ENV=production`, `EBOTO_ADMIN_EMAIL`, and `EBOTO_ADMIN_PASSWORD` before starting with a new database. Store these values in the hosting provider’s secret manager, not in source control.

## Data and privacy

The database and processed candidate portraits are stored under `data/` by default. Set `EBOTO_DATA_DIR` to use a private persistent volume. Student eligibility is stored separately from ballots: ballot records contain no student or user identifier, and database triggers prevent ballot and audit-log updates or deletion. A ballot submission inserts every position’s selection (including abstentions) and marks the voter as having voted in one SQLite transaction.

An admin can create an election, upload square-cropped candidate portraits, import a CSV with a `student_id` or `student_number` column, and publish the election. Candidate portraits appear in the student ballot and profile view. Results include turnout by college and program as well as candidate totals. CSV imports match existing student accounts; unmatched IDs are reported and not added. The admin console includes the verification queue so the public sign-in screen exposes exactly Student and Admin. Admin and verification actions are written to the audit trail.

Students can create an account from the Student sign-in screen using their student ID, name, college, program, year level, and a password. After registration, students can request verification from an open or scheduled election. The request adds them to that election’s pending verification queue; an admin must review and verify eligibility before voting. Registration details are self-reported, so connect registration to an approved CTU identity-verification process before live use.

Candidate photos must be JPG, PNG, or WebP and no larger than 2 MB. The server decodes and normalizes them to 480 × 480 WebP before storage.

## Production readiness

This repository is a local application prototype, not a deployment certification. Before a live election, configure HTTPS and a durable private data volume, connect account registration to an approved CTU identity-verification process, set retention and backup policies, and complete security, accessibility, load, and disaster-recovery testing. The demo seed is intended only for development.
