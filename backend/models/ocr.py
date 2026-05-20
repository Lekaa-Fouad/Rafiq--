import easyocr
import numpy as np
import cv2

class OCRModel:
    def __init__(self):
        self.reader = easyocr.Reader(['ar', 'en'])

    def extract_text(self, image_bytes: bytes) -> dict:
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            return {"annotations": [], "full_text": ""}
            
        results = self.reader.readtext(image)
        
        annotations = []
        full_text_list = []
        
        for res in results:
            text = res[1]
            confidence = float(res[2])
            
            annotations.append({
                "text": text,
                "confidence": round(confidence, 2)
            })
            full_text_list.append(text)
            
        return {
            "annotations": annotations,
            "full_text": " ".join(full_text_list)
        }