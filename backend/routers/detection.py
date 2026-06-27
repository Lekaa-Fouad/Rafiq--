from fastapi import APIRouter, Request, UploadFile, File, HTTPException
from services.detection_service import DetectionService
import cv2
import numpy as np

router = APIRouter(prefix="/detection", tags=["Object Detection"])

detection_service = DetectionService()

@router.post("/process-frame")
async def analyze_frame(request: Request, file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        yolo_model = request.app.state.yolo_model
        midas_model = request.app.state.midas_model
        midas_transforms = request.app.state.midas_transforms
        device = request.app.state.device

        events = detection_service.process_frame(
            frame, yolo_model, midas_model, midas_transforms, device
        )

        return {"status": "success", "detections": events}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        await file.close()