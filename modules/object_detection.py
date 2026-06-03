

from ultralytics import YOLO
import cv2
import time
import json

model = YOLO("yolov8m.pt")

# Camera
cap = cv2.VideoCapture(0)

# Track object state
objects_state = {}

COOLDOWN = 5
MOVE_THRESHOLD = 80
DISTANCE_LEVELS = ["far", "medium distance", "close", "very close"]






#Distance calculation 

KNOWN_WIDTHS = {
    "person": 45,
    "car": 180,
    "bus": 250,
    "truck": 250,
    "bicycle": 60,
    "motorcycle": 80,
    "chair": 40,
    "cell phone": 8,
    "bottle": 8,
    "cup": 8,
    "laptop": 35,
    "keyboard": 45,
    "book": 20,
    "exit": 90,
    "door": 90
}

DEFAULT_WIDTH = 50   # cm
FOCAL_LENGTH = 800   # calibration constant


def get_direction(x_center, frame_w):
    if x_center < frame_w * 0.33:
        return "on your left"
    elif x_center > frame_w * 0.66:
        return "on your right"
    else:
        return "in front of you"








def estimate_distance(box_w, frame_w):
    ratio = box_w / frame_w

    if ratio > 0.50:
        return "very close"
    elif ratio > 0.25:
        return "close"
    elif ratio > 0.10:
        return "medium distance"
    else:
        return "far"








def calc_distance_m(label, pixel_width):
    """
    Pinhole camera model distance estimation in meters.
    """
    if pixel_width <= 0:
        return 0.0

    real_width = KNOWN_WIDTHS.get(label, DEFAULT_WIDTH)
    distance_cm = (real_width * FOCAL_LENGTH) / pixel_width
    return round(distance_cm / 100, 2)









def detect_motion(prev_x, current_x):
    dx = current_x - prev_x

    if abs(dx) < 25:
        return "static"
    elif dx > 0:
        return "moving right"
    else:
        return "moving left"


def emit_json(track_id, name, conf, direction, distance, distance_m, motion, message):
    event = {
        "timestamp": time.time(),
        "object_id": track_id,
        "object": name,
        "confidence": round(float(conf), 2),
        "direction": direction,        
        "distance": distance,        
        "distance_m": distance_m,   
        "motion": motion,
        "speech": message
    }

    print(json.dumps(event, ensure_ascii=False), flush=True)


while True:
    ret, frame = cap.read()
    if not ret:
        break

    h, w, _ = frame.shape
    now = time.time()

    results = model.track(
        frame,
        persist=True,
        tracker="botsort.yaml",
        conf=0.30,
        iou=0.5,
        imgsz=960,
        verbose=False
    )[0]

    if results.boxes is not None and results.boxes.id is not None:

        boxes = results.boxes.xyxy
        ids = results.boxes.id.int().tolist()
        classes = results.boxes.cls.int().tolist()
        confs = results.boxes.conf.tolist()

        for box, track_id, cls_id, conf in zip(boxes, ids, classes, confs):
            x1, y1, x2, y2 = box.tolist()

            x_center = (x1 + x2) / 2
            box_w = x2 - x1

            name = results.names[cls_id]

            direction = get_direction(x_center, w) 
            distance = estimate_distance(box_w, w)
            distance_m = calc_distance_m(name, box_w)   

            message = f"{name} {direction}, {distance} ({distance_m} m)"

            if track_id not in objects_state:
                motion = "static"

                objects_state[track_id] = {
                    "direction": direction,  
                    "distance": distance,
                    "distance_m": distance_m,   
                    "x": x_center,
                    "time": now,
                    "last_message": message
                }

                emit_json(
                    track_id,
                    name,
                    conf,
                    direction,
                    distance,
                    distance_m,
                    motion,
                    message
                )

            else:
                prev = objects_state[track_id]

                motion = detect_motion(prev["x"], x_center)

                direction_changed = prev["direction"] != direction

                distance_changed = (
                    abs(
                        DISTANCE_LEVELS.index(prev["distance"])
                        - DISTANCE_LEVELS.index(distance)
                    ) >= 1
                )

                moved_far = abs(prev["x"] - x_center) > MOVE_THRESHOLD
                cooldown_passed = (now - prev["time"]) > COOLDOWN

                if (direction_changed or distance_changed) and moved_far and cooldown_passed:
                    if prev["last_message"] != message:
                        emit_json(
                            track_id,
                            name,
                            conf,
                            direction,
                            distance,
                            distance_m,
                            motion,
                            message
                        )

                        objects_state[track_id] = {
                            "direction": direction,
                            "distance": distance,
                            "distance_m": distance_m,
                            "x": x_center,
                            "time": now,
                            "last_message": message
                        }

            label = f"{name} {conf:.2f} ID:{track_id}"

            cv2.rectangle(
                frame,
                (int(x1), int(y1)),
                (int(x2), int(y2)),
                (0, 0, 255),
                2
            )

            cv2.putText(
                frame,
                label,
                (int(x1), int(y1 - 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2
            )

    cv2.imshow("Tracking", frame)

    if cv2.waitKey(1) == 27:   # ESC
        break

cap.release()
cv2.destroyAllWindows()