# Project Walkthrough

## Problem This Solves

Healthcare claim data often comes from different hospital or portal systems, while policy data comes from insurers in a different structure.

That creates manual work:

- operations teams compare data by hand
- review teams struggle to explain rejections
- audit teams do not have a clean review trail

This project solves that by normalizing claim and policy data and running explainable validation rules before submission.

## Working Flow

### 1. User provides two JSON payloads

- claim JSON
- policy JSON

These can come from different systems and do not need to share the same structure.

### 2. Backend normalizes the raw data

The normalization layer maps the raw data into a standard internal structure so the rule engine can work consistently.

Examples of normalized areas:

- patient
- treatment
- billing
- policy number
- policy age
- room rent limit
- covered treatments
- waiting period

### 3. Rule engine checks the normalized data

The system runs built-in rules and any policy-provided custom rules.

Built-in examples:

- room rent limit
- treatment coverage
- waiting period
- duplicate charges

### 4. System returns an explainable result

The output includes:

- overall status
- failed or warning issues
- normalized claim and policy
- inferred field mappings
- full rule log

### 5. Frontend turns that into an operational workflow

The React frontend lets users:

- upload files
- review the result in plain language
- inspect audit history
- understand policy rules
- review reports and trends

## Frontend Views

## Claim Review

Best for daily use by reviewers. It shows:

- claim and policy upload area
- overall validation outcome
- issues requiring action
- normalized patient summary
- technical details for advanced review

## Audit History

Best for tracking previous reviews. It shows:

- previous review runs
- decision status per run
- issue counts
- selected audit summary
- what changed compared to an earlier run

## Policy Rules

Best for explainability. It shows:

- built-in rules
- custom rules from the policy JSON
- inferred mappings used by the engine

## Reports

Best for leads and audit users. It shows:

- claim review volume
- rejection-risk trend
- warning queue
- repeated rule issues
- operational recommendations

## Why This Is Useful

This project is useful because it helps users:

- reduce manual comparison work
- detect rejection risk earlier
- standardize reviews across teams
- explain why a claim failed
- create a simple audit trail

## Future Improvements

- persist audit history in the backend
- export report summaries as PDF or CSV
- add authentication and role-based views
- support policy versioning
- add a true dashboard with filters and charts

