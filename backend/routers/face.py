"""
routers/face.py — Face recognition endpoints.
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, File, Form, UploadFile

from core.dependencies import get_db, get_redis, verify_api_key
from core.exceptions import RafiqException
from core.responses import RafiqResponse, success_response
from models.face import (
    FaceDeleteResponse,
    FaceIdentifyResponse,
    FaceListItem,
    FaceRegisterResponse,
)
from services import face_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/face",
    tags=["Face"],
    dependencies=[Depends(verify_api_key)],
)


@router.post(
    "/register",
    summary="Register a face profile",
    response_model=RafiqResponse[FaceRegisterResponse],
)
async def register_face(
    name: str = Form(..., min_length=1, max_length=100),
    image: UploadFile = File(..., description="Portrait image containing one clear face."),
    db_conn=Depends(get_db),
    redis=Depends(get_redis),
):
    """
    Expects multipart/form-data with:
    - name: text
    - image: file
    """
    clean_name = name.strip()
    if not clean_name:
        raise RafiqException(
            message="Name must contain non-whitespace characters.",
            spoken_message="Please provide a valid name.",
            status_code=422,
        )

    logger.info("[FACE] /register called — name: %s", clean_name)

    try:
        image_bytes = await image.read()
    except Exception as exc:
        raise RafiqException(
            message=f"Failed to read uploaded image: {exc}",
            spoken_message="I couldn't read the uploaded image. Please try again.",
            status_code=422,
        ) from exc

    result = await face_service.register_face(
        name=clean_name,
        image_bytes=image_bytes,
        db_conn=db_conn,
        redis=redis,
    )
    return success_response(
        data=result,
        message="Face profile registered successfully.",
        spoken_message=f"{clean_name} has been registered successfully.",
    )


@router.post(
    "/identify",
    summary="Identify a person from an image",
    response_model=RafiqResponse[FaceIdentifyResponse],
)
async def identify_face(
    image: UploadFile = File(..., description="Portrait image to identify."),
    db_conn=Depends(get_db),
    redis=Depends(get_redis),
):
    """
    Expects multipart/form-data with:
    - image: file
    """
    logger.info("[FACE] /identify called")
    try:
        image_bytes = await image.read()
    except Exception as exc:
        raise RafiqException(
            message=f"Failed to read uploaded image: {exc}",
            spoken_message="I couldn't read the uploaded image. Please try again.",
            status_code=422,
        ) from exc

    result = await face_service.identify_face(
        image_bytes=image_bytes,
        db_conn=db_conn,
        redis=redis,
    )
    return success_response(
        data=result,
        message="Face identification completed.",
        spoken_message="Face identification completed.",
    )


@router.get(
    "/list",
    summary="List all registered face profiles",
    response_model=RafiqResponse[List[FaceListItem]],
)
async def list_faces(db_conn=Depends(get_db)):
    logger.info("[FACE] /list called")
    result = await face_service.list_faces(db_conn=db_conn)
    return success_response(
        data=result,
        message="Face profiles fetched successfully.",
        spoken_message="Face profiles fetched successfully.",
    )


@router.delete(
    "/{face_id}",
    summary="Delete a face profile by UUID",
    response_model=RafiqResponse[FaceDeleteResponse],
)
async def delete_face(
    face_id: str,
    db_conn=Depends(get_db),
    redis=Depends(get_redis),
):
    logger.info("[FACE] /%s delete called", face_id)
    result = await face_service.delete_face(
        face_id=face_id,
        db_conn=db_conn,
        redis=redis,
    )
    return success_response(
        data=result,
        message="Face profile deletion processed.",
        spoken_message="Face profile deletion processed.",
    )
