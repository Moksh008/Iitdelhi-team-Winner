import re
from typing import Any, Dict, List, Optional, Tuple

# Local contacts are intentionally empty until a verified, maintained directory
# is configured. Provider results must never be synthesized from this module.
CONTACTS: List[Dict[str, Any]] = []


def _normalise(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _is_generic_location_phrase(value: str) -> bool:
    words = _normalise(value).split()
    if any(word in words for word in {
        "द्वारा", "एक्सीडेंट", "दुर्घटना", "हादसा", "घायल",
        "accident", "injured", "emergency", "send", "पैसे",
    }):
        return True
    filler_words = {
        "के", "का", "की", "सामने", "पास", "नजदीक",
        "the", "in", "near", "at", "front", "opposite",
    }
    meaningful_words = [word for word in words if word not in filler_words]
    return len(meaningful_words) == 1 and meaningful_words[0] in {
        "यूनिवर्सिटी", "विश्वविद्यालय", "कॉलेज", "अस्पताल",
        "university", "college", "hospital",
    }


def _find_amount(text: str) -> Optional[Tuple[str, float]]:
    match = re.search(
        r"(?:₹|rs\.?|inr)\s*([0-9][0-9,]*)|"
        r"([0-9][0-9,]*)\s*(?:rupees?|रुपये|रुपए|रुपये)", text, re.IGNORECASE
    )
    if not match:
        return None
    raw_amount = match.group(1) or match.group(2)
    amount = float(raw_amount.replace(",", ""))
    return match.group(0), amount


def extract_claim_entities(text: str) -> List[Dict[str, Any]]:
    normalised = _normalise(text)
    entities: List[Dict[str, Any]] = []

    landmark_match = re.search(
        r"\b(chitkara\s+university|chitkara\s+univercity)\b",
        normalised,
        re.IGNORECASE,
    )
    if landmark_match:
        entities.append({
            "type": "LOCATION",
            "text": landmark_match.group(1),
            "normalized_text": "Chitkara University, Rajpura, Punjab",
            "confidence": 0.9,
            "source": "landmark_gazetteer",
        })

    punjabi_university_match = re.search(
        r"\b(punjabi|panjabi)\s+university\b",
        normalised,
        re.IGNORECASE,
    )
    if punjabi_university_match and not any(entity["type"] == "LOCATION" for entity in entities):
        entities.append({
            "type": "LOCATION",
            "text": punjabi_university_match.group(0),
            "normalized_text": "Punjabi University, Patiala, Punjab",
            "confidence": 0.9,
            "source": "landmark_gazetteer",
        })

    mixed_landmark_match = re.search(
        r"(?:accident|एक्सीडेंट|दुर्घटना|हादसा)"
        r"(?P<landmark>.{2,100}?)\s+"
        r"(?:के|का|की)\s+(?:सामने|सामना|पास|नजदीक|बगल में)",
        normalised,
        re.IGNORECASE,
    )
    if mixed_landmark_match and not any(entity["type"] == "LOCATION" for entity in entities):
        landmark = mixed_landmark_match.group("landmark").strip(" .,")
        landmark = re.sub(r"^(?:का|के|की|द्वारा|at|near|the)\s+", "", landmark)
        if not _is_generic_location_phrase(landmark):
            entities.append({
                "type": "LOCATION",
                "text": landmark,
                "normalized_text": landmark,
                "confidence": 0.78,
                "source": "mixed_script_landmark_extractor",
            })

    hindi_landmark_match = re.search(
        r"([\u0900-\u097F][\u0900-\u097F\s]{1,60}?"
        r"(?:यूनिवर्सिटी|विश्वविद्यालय|कॉलेज|अस्पताल))\s+"
        r"(?:के|का|की)?\s*(?:सामने|सामना|पास|नजदीक|बगल में)",
        normalised,
    )
    if hindi_landmark_match and not any(entity["type"] == "LOCATION" for entity in entities):
        landmark = hindi_landmark_match.group(1).strip()
        if not _is_generic_location_phrase(landmark):
            is_chitkara = "चितकारा" in landmark or "चिटकारा" in landmark
            entities.append({
                "type": "LOCATION",
                "text": landmark,
                "normalized_text": "Chitkara University, Rajpura, Punjab" if is_chitkara else landmark,
                "confidence": 0.9 if is_chitkara else 0.75,
                "source": "hindi_landmark_extractor",
            })

    if not any(entity["type"] == "LOCATION" for entity in entities):
        natural_landmark = re.search(
            r"\b(?:near|at|opposite)\s+(?:the\s+)?"
            r"([a-z0-9][a-z0-9 .'-]{2,70}?"
            r"(?:university|college|hospital|market|mall|airport|station|"
            r"bus stand|railway station|road|chowk|mode|gate|sector)\b"
            r"(?:\s+[a-z][a-z .'-]{0,30})?)"
            r"(?=\s+(?:in|at|near)\s+[a-z]|[,.]|$)",
            normalised,
            re.IGNORECASE,
        )
        if natural_landmark:
            landmark = natural_landmark.group(1).strip(" .,")
            if _is_generic_location_phrase(landmark):
                natural_landmark = None
        if natural_landmark:
            entities.append({
                "type": "LOCATION",
                "text": landmark,
                "normalized_text": landmark,
                "confidence": 0.76,
                "source": "natural_landmark_extractor",
            })

    if not any(entity["type"] == "LOCATION" for entity in entities):
        named_place_match = re.search(
            r"\b(?:near|at|opposite)\s+(?:the\s+)?"
            r"(?P<place>[a-z0-9][a-z0-9 .'-]{2,70}?)"
            r"(?=\s+(?:in|near|at|because|and|but|send|transfer|call|pay|"
            r"he|she|they|we|you)\b|[,.;!?]|$)",
            normalised,
            re.IGNORECASE,
        )
        if named_place_match:
            landmark = named_place_match.group("place").strip(" .,")
            words = landmark.split()
            if len(words) >= 2 and words[0] not in {
                "my", "your", "his", "her", "their", "our", "a", "an", "some",
            }:
                entities.append({
                    "type": "LOCATION",
                    "text": landmark,
                    "normalized_text": landmark,
                    "confidence": 0.68,
                    "source": "nearby_named_place_extractor",
                })

    if not any(entity["type"] == "LOCATION" for entity in entities):
        landmark_before_relation = re.search(
            r"\b([a-z][a-z0-9 .'-]{2,70}?"
            r"(?:university|college|hospital|market|mall|airport|station|"
            r"bus stand|railway station|road|chowk|mode|gate|sector))\s+"
            r"(?:ke|ka|ki|near|at|opposite)\s+"
            r"(?:samne|samna|saamne|front|opposite)\b",
            normalised,
            re.IGNORECASE,
        )
        if landmark_before_relation:
            entities.append({
                "type": "LOCATION",
                "text": landmark_before_relation.group(1).strip(),
                "normalized_text": landmark_before_relation.group(1).strip(),
                "confidence": 0.76,
                "source": "natural_landmark_extractor",
            })

    if not any(entity["type"] == "LOCATION" for entity in entities):
        sector_match = re.search(
            r"\bsector\s+\d+[a-z]?(?:\s+[a-z]{2,20}){0,2}\b",
            normalised,
            re.IGNORECASE,
        )
        if sector_match:
            entities.append({
                "type": "LOCATION",
                "text": sector_match.group(0),
                "normalized_text": sector_match.group(0),
                "confidence": 0.7,
                "source": "natural_location_extractor",
            })

    near_comma_match = re.search(
        r"\b(?:near|at|opposite)\s+"
        r"([A-Za-z][A-Za-z0-9 .'-]{2,70}?)\s*,\s*"
        r"([A-Za-z][A-Za-z .'-]{2,40}?)(?=[.!?]|$)",
        normalised,
        re.IGNORECASE,
    )
    if near_comma_match:
        landmark = near_comma_match.group(1).strip(" .,")
        city = near_comma_match.group(2).strip(" .,")
        location = next((entity for entity in entities if entity["type"] == "LOCATION"), None)
        if location is not None:
            location["text"] = f"{landmark}, {city}"
            location["normalized_text"] = f"{landmark}, {city}"
            location["confidence"] = max(location["confidence"], 0.82)
            location["source"] = "comma_location_extractor"
        else:
            entities.append({
                "type": "LOCATION",
                "text": f"{landmark}, {city}",
                "normalized_text": f"{landmark}, {city}",
                "confidence": 0.82,
                "source": "comma_location_extractor",
            })

    for entity in entities:
        if entity["type"] == "LOCATION":
            entity["normalized_text"] = re.sub(
                r"\s+(?:ke|ka|ki)\s+(?:samne|samna|saamne|front)$",
                "",
                entity["normalized_text"],
                flags=re.IGNORECASE,
            ).strip()

    for contact in CONTACTS:
        for alias in contact["aliases"]:
            if alias in normalised:
                entities.append({
                    "type": "HOSPITAL" if contact["type"] == "hospital" else "LOCATION",
                    "text": alias,
                    "normalized_text": contact["name"] if contact["type"] == "hospital" else contact["address"],
                    "confidence": 0.92 if contact["type"] == "hospital" else 0.82,
                    "source": "local_gazetteer",
                })
                break

    location_match = re.search(
        r"\b(?:near|at|in)\s+(top\s+khana\s+(?:mode|mod)|[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}),?\s+"
        r"(?:in|near|at)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})"
        r"|"
        r"\b(top\s+khana\s+(?:mode|mod)|[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}),?\s+"
        r"(?:in|near|at)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})",
        text,
    )
    if not location_match:
        location_match = re.search(
            r"\b(top\s+khana\s+(?:mode|mod)|top\s+khana\s+mod[e]?)\s+"
            r"(patiala|patial\s*a|patial)\b",
            normalised,
            re.IGNORECASE,
        )
    if location_match and not any(entity["type"] == "LOCATION" for entity in entities):
        location_groups = location_match.groups()
        if len(location_groups) == 2:
            place, city = location_groups
        else:
            place = location_groups[0] or location_groups[2]
            city = location_groups[1] or location_groups[3]
        city = re.sub(r"\s+", "", city).replace("patial", "Patial")
        city = "Patiala" if city.lower().startswith("patial") else city
        location_text = f"{place}, {city}"
        entities.append({
            "type": "LOCATION",
            "text": location_text,
            "normalized_text": location_text,
            "confidence": 0.72,
            "source": "pattern_extractor",
        })

    if re.search(
        r"\b(accident|injured|icu|hospital|admitted|ambulance|emergency)\b"
        r"|एक्सीडेंट|दुर्घटना|हादसा|घायल|अस्पताल|आईसीयू|एम्बुलेंस|इमरजेंसी",
        normalised,
        re.IGNORECASE,
    ):
        entities.append({
            "type": "EMERGENCY_EVENT",
            "text": "medical or accident emergency",
            "normalized_text": "medical_or_accident_emergency",
            "confidence": 0.86,
            "source": "pattern_extractor",
        })

    amount = _find_amount(text)
    if amount:
        entities.append({
            "type": "AMOUNT",
            "text": amount[0],
            "normalized_text": str(amount[1]),
            "confidence": 0.99,
            "source": "amount_parser",
        })

    if re.search(
        r"\b(send|transfer|pay|payment|money|bill|deposit)\b"
        r"|भेजो|भेजना|पैसे|पैसा|भुगतान|रुपये|जमा",
        normalised,
        re.IGNORECASE,
    ):
        entities.append({
            "type": "PAYMENT_REQUEST",
            "text": "urgent payment request",
            "normalized_text": "payment_request",
            "confidence": 0.84,
            "source": "pattern_extractor",
        })

    if re.search(r"\b(shop|shops|store|stores|market|nearby|near me)\b", normalised):
        entities.append({
            "type": "NEARBY_PLACE_REQUEST",
            "text": "nearby shop or place lookup",
            "normalized_text": "shop",
            "confidence": 0.88,
            "source": "pattern_extractor",
        })
    return entities


def _local_contacts(entities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return []


def resolve_claim(text: str) -> Dict[str, Any]:
    entities = extract_claim_entities(text)
    contacts = _local_contacts(entities)
    provider = "local"
    notice = None

    has_location = any(entity["type"] == "LOCATION" for entity in entities)
    has_emergency = any(entity["type"] in {"EMERGENCY_EVENT", "HOSPITAL", "LOCATION"} for entity in entities)
    if has_emergency and not has_location:
        notice = "The caller mentioned an emergency but no specific university, area, hospital, or landmark. Ask for the exact location before searching nearby contacts."

    has_payment = any(entity["type"] == "PAYMENT_REQUEST" for entity in entities)
    wants_nearby_places = any(entity["type"] == "NEARBY_PLACE_REQUEST" for entity in entities)
    has_police_claim = bool(re.search(r"\bpolice|arrest|cbi|court\b|पुलिस|गिरफ्तार", text, re.IGNORECASE))
    place_category = (
        "police station" if has_police_claim
        else "hospital" if has_emergency
        else "business" if wants_nearby_places
        else None
    )
    return {
        "entities": entities,
        "contacts": contacts,
        "recommended_action": (
            "VERIFY_BEFORE_PAYMENT" if has_payment and has_emergency
            else "SHOW_NEARBY_PLACES" if (wants_nearby_places or has_emergency or has_location)
            else "MONITOR"
        ),
        "provider": provider,
        "notice": notice,
        "place_category": place_category,
    }

