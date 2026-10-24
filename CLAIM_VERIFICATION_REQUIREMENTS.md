# Satark Independent Claim Verification

> **Superseded (v2.0):** Azure Maps and the app-to-backend transcript flow described here were removed for hackathon compliance. Current design: `docs/12_OFFLINE_AI_AND_FREE_SERVICES.md`.

## 1. Purpose

This document defines the requirements for a Satark feature that helps a user independently verify an urgent claim made during a suspicious call.

Example claim:

> “Your son has had an accident near Top Khana Mode in Patiala. Send ₹5,000 immediately for hospital treatment.”

The feature must detect the claim, identify the hospital or location, find trusted contact options, and help the user verify the claim before sending money.

The feature is a **verification assistant**, not an automatic fraud adjudicator. A positive or negative response from a third party must be shown as supporting evidence, not absolute proof.

## 0. Implementation status

### Completed

- Existing multilingual DistilBERT scam classifier is trained and connected.
- Emergency-payment examples have been added to the training pipeline.
- Emergency-payment behavior detection is implemented in the frontend and backend.
- Hospital/family emergency scam and legitimate hospital-message test cases have been validated.
- Rolling risk, payment context, and verification-warning tiers already exist.
- This requirements document defines the target claim-verification workflow and acceptance criteria.
- Prototype `/api/v1/claim-verification` and `/api/v1/verification-events` endpoints are implemented.
- Local-first demo contacts, entity extraction, amount extraction, and verification panel are implemented.
- Azure Maps is supported as an optional server-side place-resolution provider when a rotated key is configured.
- `POST /api/v1/transcript-chunk` combines transcript scoring with claim verification.
- `POST /api/v1/nearby-places` provides Azure Maps-backed nearby lookup when configured.
- Android has an `InCallService` lifecycle bridge and `ACTION_DIAL` integration scaffold.

### In progress

- Production streaming speech-to-text provider and Android consent flow.
- Curated local place/contact data and freshness process.
- Fuzzy location resolution beyond the seeded aliases.
- Android device and carrier compatibility testing.

### Not implemented yet

- Reliable live access to both sides of ordinary cellular-call audio.
- Automatic synchronization and verification of hospital/business phone numbers.
- Production Android overlay approval and default-dialer role testing.
- End-to-end real-device latency, privacy, and false-positive validation.

### Current completion estimate

Against the complete production scope in this document:

- **Implemented foundation:** approximately 55–60%
- **Prototype claim-verification workflow:** approximately 80–85%
- **Production-ready system:** not yet complete

These are scope estimates, not test coverage or model accuracy. The largest remaining work is live cellular-audio access, trusted contact data, production speech recognition, and Android platform validation.

## 0.1 Azure Maps integration and secret handling

Azure Maps can support geocoding, fuzzy place search, reverse geocoding, and nearby search. It should be used as a lookup provider, not as proof that an accident occurred or that a phone number belongs to an official institution.

Required configuration:

```text
AZURE_MAPS_KEY=<server-side subscription key>
AZURE_MAPS_CLIENT_ID=<optional managed-identity/client identifier>
AZURE_MAPS_BASE_URL=https://atlas.microsoft.com
```

Rules:

- Store the subscription key only in a server-side environment variable or secret manager.
- Never place the key in React source, browser JavaScript, Android resources, documentation, logs, screenshots, or Git history.
- Keep Azure Maps requests behind the FastAPI backend.
- Restrict the key by scope, quota, and allowed services where Azure supports it.
- Add request timeouts, rate limits, caching, and error handling.
- Record provider, query, confidence, and freshness metadata, but not unnecessary transcript content.
- Prefer local verified contacts before making a network lookup.

**Security action required:** a subscription key was pasted into the chat/IDE context. Treat it as compromised, revoke or rotate it in Azure immediately, and create a new server-only secret. The exposed value must not be reused.

Azure Maps does not provide verified hospital phone numbers by itself. Contact numbers must come from a curated official/government source or a separately verified directory. Any map-provider result must be labeled with its source and verification status.

## 2. Goals

- Process transcript chunks during a consented call-analysis session.
- Detect hospitals, locations, landmarks, roads, cities, people, amounts, payment requests, and emergency claims.
- Resolve misspelled or mispronounced locations with a confidence score.
- Look up official hospitals and nearby public establishments.
- Prefer locally cached and verified contacts for low latency.
- Display a small in-call verification panel.
- Let the user manually choose which contact to call.
- Preserve privacy by sharing only the minimum necessary information.
- Prevent payment approval until the user has had an opportunity to verify a high-risk claim.

## 3. Non-goals

- Proving that the caller is the child, parent, doctor, or police officer.
- Proving that an accident happened from a single shopkeeper response.
- Automatically calling random businesses.
- Automatically sharing the child's name, phone number, medical records, or transcript.
- Recording ordinary cellular calls without platform support and explicit user consent.
- Replacing police, emergency services, hospitals, or professional emergency responders.

## 4. Target user flow

1. A caller makes an urgent hospital or accident claim.
2. The user has enabled call analysis and consented to transcript processing.
3. Satark receives partial transcript text in 1–3 second chunks.
4. Satark detects:
   - emergency or accident language;
   - a hospital or location;
   - an urgent payment request.
5. Satark shows a warning:

   ```text
   Possible emergency-payment claim detected.
   Verify independently before paying.
   ```

6. The system resolves the named place and displays confidence.
7. Satark shows available independent contacts:
   - saved family contacts;
   - official hospital number;
   - police or emergency number;
   - nearby hospital or pharmacy;
   - nearby public establishment, when appropriate.
8. The user chooses a contact and confirms before the phone dialer opens.
9. Satark records only the verification outcome selected by the user:
   - confirmed;
   - not confirmed;
   - unavailable;
   - user declined.
10. Satark recommends additional verification and does not make a definitive fraud claim.

## 5. Example scenarios

### 5.1 Hospital admission claim

Input:

```text
Your child has been admitted to Alpha Hospital. Send ₹5,000 immediately for billing.
```

Expected detection:

```json
{
  "claim_type": "hospital_admission",
  "hospital": "Alpha Hospital",
  "payment_amount_inr": 5000,
  "urgent_payment": true,
  "recommended_action": "VERIFY_BEFORE_PAYMENT"
}
```

The UI should prioritize the hospital's official contact from the local verified database. A public listing must be labeled as a public listing, not as an official hospital number.

### 5.2 Accident-location claim

Input:

```text
Your son was in an accident near Top Khana Mode in Patiala. Send money now.
```

Expected detection:

```json
{
  "claim_type": "accident",
  "location_text": "Top Khana Mode in Patiala",
  "resolved_location": "Top Khana Mode, Patiala, Punjab",
  "location_confidence": 0.82,
  "payment_amount_inr": null,
  "recommended_action": "VERIFY_BEFORE_PAYMENT"
}
```

The UI may show nearby establishments, but the preferred contacts are official emergency services, the police, hospitals, and saved family contacts.

## 6. Functional requirements

### FR-1: Transcript ingestion

- Accept partial transcript chunks from an approved audio/transcription source.
- Include a session identifier and sequence number.
- Support English, Hindi, Hinglish, and the Indian languages already supported by Satark.
- Process a chunk without waiting for the complete call.
- Redact sensitive identifiers before persistence or remote processing.

Suggested request:

```json
{
  "session_id": "call-session-123",
  "sequence": 12,
  "text": "Your son had an accident near Top Khana Mode in Patiala.",
  "language": "en",
  "is_final": false
}
```

### FR-2: Entity extraction

Detect these entity types:

- `HOSPITAL`
- `LOCATION`
- `LANDMARK`
- `ROAD`
- `CITY`
- `PERSON_RELATION`
- `AMOUNT`
- `UPI_ID`
- `PHONE_NUMBER`
- `EMERGENCY_EVENT`
- `PAYMENT_REQUEST`
- `URGENCY`
- `ISOLATION`

Each entity must include:

```json
{
  "type": "LOCATION",
  "text": "Top Khana Mode in Patiala",
  "normalized_text": "Top Khana Mode, Patiala",
  "confidence": 0.82,
  "source": "ner_and_gazetteer"
}
```

### FR-3: Location resolution

- Normalize Unicode and punctuation.
- Support common spelling and pronunciation variations.
- Use city context when resolving ambiguous names.
- Return one or more candidates with confidence.
- Never silently select a low-confidence candidate.
- Require user selection when multiple candidates are plausible.

Candidate response:

```json
{
  "query": "Top Khana Mod Patiala",
  "candidates": [
    {
      "name": "Top Khana Mode",
      "city": "Patiala",
      "state": "Punjab",
      "latitude": 30.3398,
      "longitude": 76.3869,
      "confidence": 0.82
    }
  ]
}
```

### FR-4: Verified contact lookup

The system must search the local database before using a network service.

Contact priority:

1. Official hospital or government emergency number.
2. Saved family contact.
3. Government or emergency-service directory.
4. Hospital's verified website contact.
5. Verified public business listing.
6. Other public establishment with a clearly labeled lower confidence.

Every contact must include:

```json
{
  "name": "Alpha Hospital",
  "type": "hospital",
  "phone": "+91XXXXXXXXXX",
  "address": "Patiala, Punjab",
  "source": "hospital_official_website",
  "verification_status": "verified",
  "last_verified_at": "2026-10-20",
  "confidence": 0.97
}
```

### FR-5: Nearby-place lookup

- Search by resolved coordinates and radius.
- Support categories such as hospital, pharmacy, police station, emergency service, and public establishment.
- Limit results to a small number of high-quality options.
- Display distance, source, phone number, confidence, and last verification date.
- Cache results with an expiry time.
- Do not represent a map-provider listing as an official contact without an independent source.

### FR-6: Verification action

- The user must tap a contact before calling.
- The app must show the source and confidence before dialing.
- The app must open the normal phone dialer or an approved in-call verification screen.
- The app must not automatically disclose private transcript content.
- The user may copy a short suggested question:

  ```text
  I received a call claiming that an accident occurred near this location.
  Can you confirm whether an incident has been reported? Please do not share
  private patient information.
  ```

### FR-7: Verification outcome

Allowed outcomes:

- `confirmed_by_official_source`
- `incident_reported_but_identity_unconfirmed`
- `not_confirmed`
- `contact_unavailable`
- `user_declined`
- `conflicting_information`

The UI must explain that:

- confirmation does not prove the caller's identity or payment account;
- a lack of confirmation does not prove that the claim is false;
- official emergency services should be contacted when there may be immediate danger.

### FR-8: Risk and payment integration

The verification signal must be combined with existing Satark signals:

- DistilBERT scam probability;
- emergency-payment behavior;
- urgency and isolation;
- unknown or new payee;
- amount anomaly;
- flagged caller number;
- verification outcome.

Recommended policy:

| Condition | Action |
|---|---|
| Hospital/location information only | Tier 0 monitoring |
| Emergency claim plus payment request | Tier 1 verification warning |
| Urgent payment plus unknown payee | Tier 2 payment pause |
| Secrecy/isolation plus urgent payment | Tier 2 payment pause |
| Official source confirms incident | Continue verification; do not auto-approve payment |
| No source confirms incident | Keep payment paused until independently verified |

## 7. Technical architecture

```text
Android call/transcript source
          |
          v
Streaming transcript gateway
          |
          +--> PII scrubber
          +--> DistilBERT scam classifier
          +--> Entity extractor
          +--> Amount/payment extractor
          |
          v
Claim aggregator
          |
          +--> Local place and contact database
          +--> Fuzzy/geospatial resolver
          +--> Optional places provider
          |
          v
Risk and verification policy
          |
          v
Android in-call panel / notification
          |
          v
User-selected verification call
```

Suggested backend modules:

```text
server/
├── transcript_gateway.py
├── entity_extractor.py
├── place_resolver.py
├── verified_contacts.py
├── nearby_places.py
└── verification_policy.py
```

Suggested API endpoints:

```text
POST /api/v1/transcript-chunk
POST /api/v1/extract-entities
POST /api/v1/resolve-place
GET  /api/v1/verified-contacts
GET  /api/v1/nearby-places
POST /api/v1/verification-events
```

## 8. Data model

### Place

```text
place_id
canonical_name
aliases
place_type
address
city
state
latitude
longitude
source
verification_status
last_verified_at
```

### Contact

```text
contact_id
place_id
phone
contact_type
source
confidence
last_verified_at
is_public
```

### Verification event

```text
event_id
session_id
entity_id
contact_id
action
outcome
created_at
```

Do not store raw call audio or full transcript by default. Store only the minimum features needed for a short-lived verification session unless the user explicitly opts into diagnostics.

## 9. Model and service choices

### Existing Satark model

Keep the current fine-tuned multilingual DistilBERT for scam classification:

- [model/saved_model/](./model/saved_model/)
- [infer.py](./model/infer.py)

It should provide a risk signal, not identity proof.

### Entity extraction

Use a separate NER component or a hybrid of:

- multilingual NER model;
- hospital/location gazetteer;
- amount and phone-number parsers;
- custom aliases and transliteration.

### Place search

Use local SQLite data first. Add a provider such as Google Places, OpenStreetMap, or a government directory only as a fallback. Store the source and freshness of every result.

## 10. Android and iOS constraints

### Android

- A production cellular-call integration may require Satark to be the default phone app and implement `InCallService`.
- Ordinary third-party apps cannot assume access to both sides of every cellular call's raw audio.
- A user-consented microphone, speakerphone, VoIP, or transcript workflow may be required.
- Overlay and notification permissions must be explicit and revocable.
- The emergency number and system dialer must always remain available.

### iOS

- CallKit supports call integration and call UI, but does not provide unrestricted third-party access to ordinary cellular-call audio.
- The iOS implementation should prioritize VoIP calls controlled by Satark, user-provided transcripts, or post-call verification.

## 11. Privacy and safety requirements

- Obtain clear consent before analyzing a call.
- Display an active analysis indicator.
- Redact Aadhaar, PAN, card, OTP, account numbers, and UPI identifiers before persistence.
- Encrypt cached contact data and session metadata.
- Do not upload raw audio unless explicitly enabled.
- Do not expose a child's identity or medical information to a shopkeeper.
- Do not automatically call or message third parties.
- Rate-limit lookup and verification requests.
- Provide a stop-analysis control.
- Keep emergency-service actions visible and easy to access.

## 12. Latency targets

For a cached local result:

| Stage | Target |
|---|---:|
| Partial transcript | under 1.5 seconds |
| Entity extraction | under 100 ms |
| Local place resolution | under 100 ms |
| Local contact lookup | under 50 ms |
| Panel update | under 100 ms |
| End-to-end first result | 1–3 seconds |

Network lookup must run asynchronously and must not block the first safety warning.

## 13. Acceptance criteria

The feature is ready for a prototype when it can:

- detect `Alpha Hospital` from a transcript chunk;
- detect `Top Khana Mode, Patiala` with a confidence score;
- resolve common spelling variants;
- extract ₹5,000 as an amount;
- identify the combination of emergency claim and payment request;
- display a Tier 1 or Tier 2 verification panel;
- return an official hospital contact from local data;
- return nearby contacts with source labels;
- require a user tap before dialing;
- show a non-definitive verification outcome;
- keep a normal hospital message below the emergency-payment threshold;
- work without network access for local database results;
- avoid storing raw audio by default.

## 14. Delivery phases

### Phase 1: Current web prototype

- Simulated transcript chunks.
- Local JSON/SQLite contact database.
- Entity extraction using deterministic patterns.
- Place aliases for a small test region.
- Verification panel in the existing React UI.

### Phase 2: Backend workflow

- Add the transcript, entity, resolution, contact, and verification APIs.
- Move contact data to SQLite.
- Add confidence and source tracking.
- Add unit tests for hospital and accident claims.

### Phase 3: Android prototype

- Add consented transcript input.
- Add notification or in-call panel.
- Add local database and cached place lookup.
- Add explicit dialer handoff.

### Phase 4: Production hardening

- Evaluate supported devices and carriers.
- Validate speech recognition across Indian languages and accents.
- Establish official contact verification procedures.
- Measure false positives and missed scams.
- Complete privacy, security, and legal review.

## 15. Safe product wording

Use:

```text
Claim not independently verified.
Please contact an official source before paying.
```

Avoid:

```text
This caller is definitely fake.
```

The system provides evidence and safer next actions. It must not replace independent human, hospital, police, or emergency-service verification.
