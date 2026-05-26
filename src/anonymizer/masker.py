import re
from typing import List, Optional

# IPP: declared IPP followed by 7-12 digit number
_IPP_RE = re.compile(r"\b(?:IPP\s*)(\d{7,12})\b", re.IGNORECASE)
# NDA: declared NDA/numéro dossier
_NDA_RE = re.compile(r"\b(?:NDA|N°\s*dossier|numéro\s*dossier)\s*:?\s*(\d{6,12})\b", re.IGNORECASE)
# Date of birth: dd/mm/yyyy or dd-mm-yyyy preceded by "né", "naissance"
_DOB_RE = re.compile(
    r"\b(?:né|née|naissance|ddn)\s*(?:le\s*)?(\d{1,2}[/\-]\d{1,2}[/\-]\d{4})\b",
    re.IGNORECASE,
)
# Standalone long numerics that look like patient IDs (9+ digits)
_LONG_NUM_RE = re.compile(r"\b(\d{9,12})\b")


def mask_text(text: Optional[str], blacklist: Optional[List[str]] = None) -> str:
    if not text:
        return ""
    result = text
    result = _IPP_RE.sub(r"[PATIENT_ID]", result)
    result = _NDA_RE.sub(r"[NDA]", result)
    result = _DOB_RE.sub(r"[DATE_NAISSANCE]", result)
    result = _LONG_NUM_RE.sub(r"[PATIENT_ID]", result)
    if blacklist:
        for name in blacklist:
            result = re.sub(re.escape(name), "[NOM]", result, flags=re.IGNORECASE)
    return result
