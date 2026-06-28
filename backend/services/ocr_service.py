import logging
import re
import cv2
import easyocr
import numpy as np
import arabic_reshaper
from bidi.algorithm import get_display

logger = logging.getLogger(__name__)


def fix_mixed_text(text: str) -> str:
   
   
    if not text or not text.strip():
        return text

    lines = text.split('\n')
    fixed_lines = []

    for line in lines:
        if re.search(r'[\u0600-\u06FF]', line):
            reshaped = arabic_reshaper.reshape(line)
            fixed_line = get_display(reshaped)
            fixed_lines.append(fixed_line)
        else:
            fixed_lines.append(line)

    return '\n'.join(fixed_lines)


class OCRService:
    def __init__(self):
        logger.info("[OCRService] Initializing EasyOCR reader (ar + en)...")
        self.reader = easyocr.Reader(['ar', 'en'])
        logger.info("[OCRService] EasyOCR reader ready.")

    def extract_text(self, image_bytes: bytes) -> dict:
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            logger.warning("[OCRService] Failed to decode image bytes.")
            return {"annotations": [], "full_text": ""}

        results = self.reader.readtext(image)

        annotations = []
        full_text_parts = []

        for _, text, confidence in results:
            fixed_text = fix_mixed_text(text)
            
            annotations.append({
                "text": fixed_text,
                "confidence": round(float(confidence), 2),
            })
            
            full_text_parts.append(fixed_text)

        
        full_text_combined = " ".join(full_text_parts)

        return {
            "annotations": annotations,
            "full_text": full_text_combined,
        }


# Singleton — imported and reused across the app
ocr_service = OCRService()