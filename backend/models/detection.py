from pydantic import BaseModel

class TrackedObjectState(BaseModel):
    direction: str
    distance: str
    distance_m: float
    x: float
    time: float
    last_message: str

class DetectionEvent(BaseModel):
    timestamp: float
    object_id: int
    object_name: str  
    confidence: float
    direction: str
    distance: str
    distance_m: float
    motion: str
    speech: str


