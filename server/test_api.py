import os
import sys

import pytest
import requests
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))

import main
from claim_verification import extract_claim_entities, nearby_places
from language_detection import detect_transcript_language


client = TestClient(main.app)


def _request(text, language="en"):
    return client.post(
        "/api/v1/analyze-text",
        json={
            "session_id": "test-session",
            "sequence": 0,
            "text": text,
            "language": language,
            "is_final": True,
        },
    )


def test_health_contract():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_empty_transcript_is_rejected():
    response = _request("   ")
    assert response.status_code == 400


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Please send the document tomorrow.", "en"),
        ("कृपया पैसे मत भेजिए।", "hi"),
        ("ગુજરાતીમાં વાત કરો", "gu"),
        ("বাংলায় কথা বলুন", "bn"),
        ("తెలుగులో మాట్లాడండి", "te"),
        ("தமிழில் பேசுங்கள்", "ta"),
        ("ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡಿ", "kn"),
        ("മലയാളത്തിൽ സംസാരിക്കുക", "ml"),
        ("ਪੈਸੇ ਨਾ ਭੇਜੋ", "pa"),
        ("ଓଡ଼ିଆ ଭାଷା", "or"),
        ("অসমীয়া ভাষাত ৰাইজ", "as"),
        ("پاکستان کی بات", "ur"),
        ("मराठी भाषा आहे", "mr"),
        ("तपाईं पैसा नदिनुहोस्", "ne"),
        ("તમે paise mat bhejo", "gu"),
        ("Aap paise mat bhejo", "hinglish"),
    ],
)
def test_transcript_language_detection(text, expected):
    assert detect_transcript_language(text) == expected


def test_auto_language_is_included_in_analysis_response():
    response = _request("कृपया पैसे मत भेजिए।", language="auto")
    assert response.status_code == 200
    assert response.json()["detected_language"] == "hi"


def test_ordinary_transcript_does_not_create_warning():
    response = _request("The meeting is tomorrow at ten in the morning.")
    assert response.status_code == 200
    body = response.json()
    assert body["risk_level"] in {"low", "insufficient_evidence"}
    assert body["action_tier"] == 0


def test_suspicious_transcript_has_structured_evidence():
    response = _request(
        "I am police. Keep this secret and transfer Rs 50000 immediately "
        "or you will be arrested."
    )
    assert response.status_code == 200
    body = response.json()
    assert body["risk_level"] in {"caution", "high"}
    assert body["action_tier"] >= 1
    assert body["evidence_indicators"]
    assert body["recommended_verification_steps"]


def test_complete_transcript_keeps_location_and_payment_across_sentences():
    response = _request(
        "Your son had an accident near Anar Dana Chowk, Patiala.\n"
        "Please send money immediately so he can be admitted."
    )
    assert response.status_code == 200
    body = response.json()
    location = next(entity for entity in body["entities"] if entity["type"] == "LOCATION")
    assert location["normalized_text"] == "anar dana chowk, patiala"
    assert any(entity["type"] == "PAYMENT_REQUEST" for entity in body["entities"])
    assert body["recommended_action"] == "VERIFY_BEFORE_PAYMENT"


def test_places_validation_and_provider_safe_empty_result(monkeypatch):
    monkeypatch.delenv("AZURE_MAPS_KEY", raising=False)
    response = client.post(
        "/api/v1/places/search",
        json={"query": "Chitkara University", "category": "hospital", "limit": 3},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["places"] == []
    assert "not configured" in body["notice"].lower()


def test_places_query_requires_minimum_length():
    response = client.post(
        "/api/v1/places/search",
        json={"query": "x", "category": "hospital", "limit": 3},
    )
    assert response.status_code == 422


def test_location_extraction_and_category_selection():
    response = _request(
        "Your son had an accident near Anar Dana Chowk, Patiala. Send money immediately."
    )
    assert response.status_code == 200
    body = response.json()
    locations = [entity for entity in body["entities"] if entity["type"] == "LOCATION"]
    assert locations[0]["normalized_text"] == "anar dana chowk, patiala"
    assert body["place_category"] == "hospital"


def test_emergency_transcript_finds_university_even_without_nearby_preposition():
    response = _request(
        "Your son admitted in the hospital in front of University Chitkara University "
        "so could you send some amount of money."
    )
    assert response.status_code == 200
    body = response.json()
    location = next(entity for entity in body["entities"] if entity["type"] == "LOCATION")
    assert location["normalized_text"] == "Chitkara University, Rajpura, Punjab"
    assert body["place_category"] == "hospital"
    assert body["recommended_action"] == "VERIFY_BEFORE_PAYMENT"
    assert body["action_tier"] >= 1


def test_emergency_transcript_finds_punjabi_university_from_screenshot():
    response = _request(
        "your son admitted in front of University sorry Punjabi University "
        "so can you give someone to money so that we can admit him"
    )
    assert response.status_code == 200
    body = response.json()
    location = next(entity for entity in body["entities"] if entity["type"] == "LOCATION")
    assert location["normalized_text"] == "Punjabi University, Patiala, Punjab"
    assert body["place_category"] == "hospital"
    assert body["recommended_action"] == "VERIFY_BEFORE_PAYMENT"
    assert body["action_tier"] >= 1


def test_places_provider_result_preserves_real_phone(monkeypatch):
    class Response:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    responses = iter([
        Response({"results": [{"position": {"lat": 30.34, "lon": 76.39}}]}),
        Response({"results": [{
            "poi": {"name": "Verified Clinic", "phone": "+911234567890"},
            "address": {"freeformAddress": "Patiala"},
            "position": {"lat": 30.341, "lon": 76.391},
        }]}),
    ])
    monkeypatch.setenv("AZURE_MAPS_KEY", "test-key")
    monkeypatch.setattr("claim_verification.requests.get", lambda *args, **kwargs: next(responses))
    result = nearby_places("Anar Dana Chowk, Patiala", "clinic", 3)
    assert result["places"][0]["phone"] == "+911234567890"
    assert result["places"][0]["retrieved_at"]


def test_places_fuzzy_match_resolves_named_college_and_prioritizes_phone_results(monkeypatch):
    class Response:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    calls = []
    responses = iter([
        Response({"results": [
            {
                "score": 0.43,
                "position": {"lat": 30.1, "lon": 76.1},
                "poi": {"name": "Unrelated College"},
                "address": {"freeformAddress": "Other city, India"},
            },
            {
                "score": 0.94,
                "type": "POI",
                "position": {"lat": 30.34, "lon": 76.39},
                "poi": {"name": "Chitkara University"},
                "address": {"freeformAddress": "Rajpura, Punjab, India"},
            },
        ]}),
        Response({"results": [
            {
                "poi": {"name": "Hospital Without Phone"},
                "address": {"freeformAddress": "Rajpura"},
                "position": {"lat": 30.341, "lon": 76.391},
            },
            {
                "poi": {"name": "Hospital With Phone", "phone": "+911234567890"},
                "address": {"freeformAddress": "Rajpura"},
                "position": {"lat": 30.342, "lon": 76.392},
            },
        ]}),
    ])

    def fake_get(url, **kwargs):
        calls.append((url, kwargs))
        return next(responses)

    monkeypatch.setenv("AZURE_MAPS_KEY", "test-key")
    monkeypatch.setattr("claim_verification.requests.get", fake_get)
    result = nearby_places("Chitkara University", "hospital", 20)

    assert result["resolved_location"]["name"] == "Chitkara University"
    assert result["resolved_location"]["address"] == "Rajpura, Punjab, India"
    assert calls[0][0].endswith("/search/fuzzy/json")
    assert calls[0][1]["params"]["countrySet"] == "IN"
    assert calls[1][1]["params"]["limit"] == 20
    assert result["places"][0]["name"] == "Hospital With Phone"


def test_location_extractor_accepts_named_college():
    entities = extract_claim_entities(
        "Your daughter is near Guru Nanak Dev Engineering College in Ludhiana."
    )
    location = next(entity for entity in entities if entity["type"] == "LOCATION")
    assert "guru nanak dev engineering college" in location["normalized_text"]


def test_location_extractor_accepts_named_place_without_known_suffix():
    entities = extract_claim_entities("Meet me near Rose Garden in Chandigarh.")
    location = next(entity for entity in entities if entity["type"] == "LOCATION")
    assert location["normalized_text"] == "rose garden"


def test_places_provider_missing_phone_is_empty_string(monkeypatch):
    class Response:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    responses = iter([
        Response({"results": [{"position": {"lat": 30.34, "lon": 76.39}}]}),
        Response({"results": [{
            "poi": {"name": "Public Listing Without Phone"},
            "address": {"freeformAddress": "Patiala"},
            "position": {"lat": 30.341, "lon": 76.391},
        }]}),
    ])
    monkeypatch.setenv("AZURE_MAPS_KEY", "test-key")
    monkeypatch.setattr("claim_verification.requests.get", lambda *args, **kwargs: next(responses))
    result = nearby_places("Anar Dana Chowk, Patiala", "business", 3)
    assert result["places"][0]["phone"] == ""


def test_places_timeout_returns_no_results(monkeypatch):
    monkeypatch.setenv("AZURE_MAPS_KEY", "test-key")

    def timeout(*args, **kwargs):
        raise requests.Timeout("provider timeout")

    monkeypatch.setattr("claim_verification.requests.get", timeout)
    result = nearby_places("Anar Dana Chowk, Patiala", "hospital", 3)
    assert result["places"] == []
    assert "failed" in result["notice"].lower()


def test_places_empty_provider_results(monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"results": []}

    monkeypatch.setenv("AZURE_MAPS_KEY", "test-key")
    monkeypatch.setattr("claim_verification.requests.get", lambda *args, **kwargs: Response())
    result = nearby_places("Unknown location", "business", 3)
    assert result["places"] == []
    assert "could not be confirmed" in result["notice"].lower()


def test_provider_cannot_inject_a_fabricated_phone(monkeypatch):
    class Response:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    responses = iter([
        Response({"results": [{"position": {"lat": 30.34, "lon": 76.39}}]}),
        Response({"results": [{
            "poi": {"name": "No Phone Listing"},
            "address": {"freeformAddress": "Patiala"},
            "position": {"lat": 30.341, "lon": 76.391},
        }]}),
    ])
    monkeypatch.setenv("AZURE_MAPS_KEY", "test-key")
    monkeypatch.setattr("claim_verification.requests.get", lambda *args, **kwargs: next(responses))
    result = nearby_places("Anar Dana Chowk, Patiala", "business", 3)
    assert "phone" in result["places"][0]
    assert result["places"][0]["phone"] == ""
