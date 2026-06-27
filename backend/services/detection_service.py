import numpy as np
import time
from models.detection import TrackedObjectState, DetectionEvent
import cv2

# constants
CALIBRATION_CONSTANT = 350
COOLDOWN = 5
MOVE_THRESHOLD = 80
DISTANCE_LEVELS = ["far", "medium distance", "close", "very close"]

class DetectionService:
    def __init__(self):
        self.objects_state = {}

    def get_direction(self, x_center: float, frame_w: int) -> str:
        if x_center < frame_w * 0.33:
            return "on your left"
        elif x_center > frame_w * 0.66:
            return "on your right"
        return "in front of you"

    def _calc_midas_distance(self, depth_map, x1, y1, x2, y2) -> float:
        y1, y2 = max(0, y1), min(depth_map.shape[0], y2)
        x1, x2 = max(0, x1), min(depth_map.shape[1], x2)
        
        object_depth_area = depth_map[y1:y2, x1:x2]
        if object_depth_area.size == 0:
            return 0.0
            
        midas_value = float(np.mean(object_depth_area))
        if midas_value <= 0:
            return 0.0
            
        distance_m = CALIBRATION_CONSTANT / midas_value
        return round(distance_m, 2)

    def estimate_distance_level(self, distance_m: float) -> str:
        if distance_m < 1.0:
            return "very close"
        elif distance_m < 2.5:
            return "close"
        elif distance_m < 4.0:
            return "medium distance"
        return "far"

    def detect_motion(self, prev_x: float, current_x: float) -> str:
        dx = current_x - prev_x
        if abs(dx) < 25:
            return "static"
        elif dx > 0:
            return "moving right"
        return "moving left"

    def process_frame(self, frame, yolo_model, midas_model, midas_transforms, device):
        events = []
        h, w, _ = frame.shape
        now = time.time()

        # --- (MiDaS) ---
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        input_batch = midas_transforms(img_rgb).to(device)

        import torch
        with torch.no_grad():
            prediction = midas_model(input_batch)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=img_rgb.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze()
        depth_map = prediction.cpu().numpy()

        # ---  (YOLO Tracker) ---
        results = yolo_model.track(
            frame, persist=True, tracker="botsort.yaml", conf=0.25, iou=0.5, verbose=False
        )[0]

        if results.boxes is not None and results.boxes.id is not None:
            boxes = results.boxes.xyxy
            ids = results.boxes.id.int().tolist()
            classes = results.boxes.cls.int().tolist()
            confs = results.boxes.conf.tolist()

            for box, track_id, cls_id, conf in zip(boxes, ids, classes, confs):
                x1, y1, x2, y2 = map(int, box.tolist())
                x_center = (x1 + x2) / 2
                name = results.names[cls_id]

                distance_m = self._calc_midas_distance(depth_map, x1, y1, x2, y2)
                distance_level = self.estimate_distance_level(distance_m)
                direction = self.get_direction(x_center, w)
                message = f"{name} {direction}, {distance_level} ({distance_m} m)"

                # ---  منع الإزعاج ---
                if track_id not in self.objects_state:
                    motion = "static"
                    self.objects_state[track_id] = TrackedObjectState(
                        direction=direction, distance=distance_level,
                        distance_m=distance_m, x=x_center, time=now, last_message=message
                    )
                    events.append(DetectionEvent(
                        timestamp=now, object_id=track_id, object_name=name,
                        confidence=conf, direction=direction, distance=distance_level,
                        distance_m=distance_m, motion=motion, speech=message,
                        bbox=[x1, y1, x2, y2],
                    ))
                else:
                    prev = self.objects_state[track_id]
                    motion = self.detect_motion(prev.x, x_center)
                    
                    direction_changed = prev.direction != direction
                    distance_changed = abs(DISTANCE_LEVELS.index(prev.distance) - DISTANCE_LEVELS.index(distance_level)) >= 1
                    moved_far = abs(prev.x - x_center) > MOVE_THRESHOLD
                    cooldown_passed = (now - prev.time) > COOLDOWN

                    if (direction_changed or distance_changed) and moved_far and cooldown_passed:
                        if prev.last_message != message:
                            events.append(DetectionEvent(
                                timestamp=now, object_id=track_id, object_name=name,
                                confidence=conf, direction=direction, distance=distance_level,
                                distance_m=distance_m, motion=motion, speech=message,
                                bbox=[x1, y1, x2, y2],
                            ))
                            self.objects_state[track_id] = TrackedObjectState(
                                direction=direction, distance=distance_level,
                                distance_m=distance_m, x=x_center, time=now, last_message=message
                            )

        return events