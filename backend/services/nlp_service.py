"""
services/nlp_service.py
-----------------------
NLP Service for the Rafiq project.

Responsibilities:
- Accept raw Arabic text from the STT module (e.g., Whisper).
- Send the text to a Google Dialogflow ES agent.
- Extract and return the detected Intent and its associated Parameters.

Dependencies:
    pip install google-cloud-dialogflow python-dotenv
"""

import logging
import os
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from google.api_core.exceptions import GoogleAPICallError, RetryError
from google.cloud import dialogflow_v2 as dialogflow

# ---------------------------------------------------------------------------
# Logging — integrates cleanly with FastAPI's Uvicorn logger
# ---------------------------------------------------------------------------
logger = logging.getLogger("rafiq.nlp_service")


# ---------------------------------------------------------------------------
# Data Transfer Object — what the service returns to the router
# ---------------------------------------------------------------------------
@dataclass
class NLPResult:
    """Structured result returned from the Dialogflow query."""

    intent: str
    confidence: float
    parameters: dict[str, Any] = field(default_factory=dict)
    fulfillment_text: str = ""
    raw_query: str = ""


# ---------------------------------------------------------------------------
# NLP Service Class
# ---------------------------------------------------------------------------
class NLPService:
    """
    Thin wrapper around the Dialogflow ES Sessions client.
    """

    def __init__(self) -> None:
        self._project_id: str = self._require_env("GOOGLE_PROJECT_ID")
        self._language_code: str = os.getenv("DIALOGFLOW_LANGUAGE_CODE", "ar")
        self._session_prefix: str = os.getenv("DIALOGFLOW_SESSION_PREFIX", "rafiq-user")

        credentials_path = self._require_env("GOOGLE_APPLICATION_CREDENTIALS")
        if not os.path.isfile(credentials_path):
            raise FileNotFoundError(
                f"Dialogflow credentials file not found at: {credentials_path}"
            )

        self._client_instance = None
        logger.info(
            "NLPService initialised (lazy client) — project='%s', language='%s'",
            self._project_id,
            self._language_code,
        )

    @property
    def _client(self):
        if self._client_instance is None:
            self._client_instance = dialogflow.SessionsClient()
        return self._client_instance

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect_intent(
        self,
        text: str,
        session_id: Optional[str] = None,
    ) -> NLPResult:
        """
        Send Arabic text to Dialogflow and return a structured NLPResult.
        """
        clean_text = self._clean_text(text)
        if not clean_text:
            raise ValueError("Input text is empty after cleaning.")

        session_id = session_id or str(uuid.uuid4())
        session_path = self._client.session_path(self._project_id, session_id)

        query_input = dialogflow.QueryInput(
            text=dialogflow.TextInput(
                text=clean_text,
                language_code=self._language_code,
            )
        )

        logger.info(
            "Sending query to Dialogflow — session='%s', text='%s'",
            session_id,
            clean_text,
        )

        try:
            response = self._client.detect_intent(
                request={"session": session_path, "query_input": query_input}
            )
        except (GoogleAPICallError, RetryError) as exc:
            logger.warning(
                "Dialogflow API error for session='%s': %s",
                session_id,
                exc,
            )
            raise
        except Exception as exc:
            logger.warning(
                "Unexpected error during Dialogflow call — session='%s': %s",
                session_id,
                exc,
            )
            raise RuntimeError(f"Unexpected NLP error: {exc}") from exc

        return self._parse_response(response, raw_query=clean_text)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _clean_text(text: str) -> str:
        """Strip surrounding whitespace and collapse internal extra spaces."""
        return " ".join(text.split())

    @staticmethod
    def _require_env(key: str) -> str:
        """Read a required environment variable or raise a clear error."""
        value = os.getenv(key)
        if not value:
            raise EnvironmentError(
                f"Required environment variable '{key}' is not set. "
                "Check your .env file."
            )
        return value

    @staticmethod
    def _parse_response(
        response: dialogflow.DetectIntentResponse,
        raw_query: str,
    ) -> NLPResult:
        """
        Extract intent, confidence, and parameters from the Dialogflow response.

        Dialogflow returns parameters as a `google.protobuf.Struct`.
        We convert it to a plain Python dict for easy serialisation.
        """
        query_result = response.query_result

        intent_name: str = query_result.intent.display_name or "UNKNOWN"
        confidence: float = round(float(query_result.intent_detection_confidence), 4)
        fulfillment_text: str = query_result.fulfillment_text or ""

        # Convert protobuf Struct → plain dict, skipping empty string values
        # that Dialogflow inserts for unpopulated parameter slots.
        raw_params: dict = dict(query_result.parameters)
        parameters: dict[str, Any] = {
            k: v
            for k, v in raw_params.items()
            if v not in ("", None, {}, [])
        }

        logger.info(
            "Dialogflow result — intent='%s', confidence=%.4f, params=%s",
            intent_name,
            confidence,
            parameters,
        )

        if intent_name == "Default Fallback Intent" or confidence < 0.5:
            logger.warning(
                "Low-confidence or fallback intent detected — "
                "intent='%s', confidence=%.4f, query='%s'",
                intent_name,
                confidence,
                raw_query,
            )

        return NLPResult(
            intent=intent_name,
            confidence=confidence,
            parameters=parameters,
            fulfillment_text=fulfillment_text,
            raw_query=raw_query,
        )


# ---------------------------------------------------------------------------
# Module-level singleton — import and reuse across the FastAPI app lifetime
# ---------------------------------------------------------------------------
nlp_service = NLPService()