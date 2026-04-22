"""
routers/ws.py — WebSocket router that wires /ws/stream to the handler.
"""

from fastapi import APIRouter, WebSocket

from ws.stream import stream_handler

router = APIRouter(
    prefix="/ws",
    tags=["WebSocket"],
)


@router.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    """
    ## WebSocket Stream

    **[STUB — Not yet implemented]**

    Real-time binary frame stream from the mobile app.
    See `ws/stream.py` for full implementation instructions.

    Connect with: `ws://host:8000/ws/stream`
    """
    await stream_handler(websocket)
