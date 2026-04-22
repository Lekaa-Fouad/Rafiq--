# Rafiq – رفيق 
> **Voice-first AI assistant application and backend for visually impaired users** — *React Native + FastAPI + Faster-Whisper + Edge-TTS + DeepFace*

## 🎯 Project Overview
Rafiq is an intelligent assistant application designed to support visually impaired users through voice and AI-powered features. 

The app listens to voice commands, processes them, and executes tasks using AI models such as OCR, face recognition, object detection, and indoor mapping. The goal is to provide a seamless, hands-free experience that helps users navigate and understand their surroundings.

---

## Table of Contents
1. [Features](#-features)
2. [Tech Stack & References](#-tech-stack--references)
3. [Team Roles](#-team-roles)
4. [Setup & Installation](#-setup--installation)
5. [Running the Application](#-running-the-application)
6. [API Documentation](#-api-documentation)
7. [Environment Variables](#-environment-variables)
8. [Project Structure](#-project-structure)
9. [Developer Notes & Guidelines](#-developer-notes--guidelines)

---

## 📌 Features
- **🎙️ Voice Input & Output**: Listen to user commands and respond with natural-sounding speech.
- **🧠 Command Processing**: Analyze commands and intelligently route them to the correct backend module.
- **📷 OCR (Text Recognition)**: Read and extract text from images.
- **🪧 Object Detection**: Detect objects and obstacles in the user's environment.
- **🙂 Face Recognition**: Identify and recognize registered people.
- **🗺️ Indoor Mapping & Navigation**: Build maps and guide the user safely indoors.

---

## 🔮 Tech Stack & References
**Front-end:** Developed as a mobile app using **React Native**.
**Back-end:** Built with **FastAPI** (Python), providing a robust API for the mobile app.

**AI Models & Core Libraries:**
- **Voice:** [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper) (STT), [Edge-TTS](https://github.com/rany2/edge-tts) (TTS), [SpeechRecognition](https://pypi.org/project/SpeechRecognition/)
- **Face:** [DeepFace](https://github.com/serengil/deepface) / Facenet, [OpenCV](https://opencv.org/)
- **Vision & OCR:** [YOLOv8](https://pjreddie.com/darknet/yolo/) (Object Detection), [EasyOCR](https://github.com/JaidedAI/EasyOCR) / PaddleOCR
- **NLP & Mapping:** [NLTK](https://www.nltk.org/), [spaCy](https://spacy.io/), [NetworkX](https://networkx.org/)

---

## 👥 Team Roles
- **Team Leader**: Integration + Command Processing.
- **Member 1**: OCR + Text-to-Speech.
- **Member 2**: Object Detection.
- **Member 3**: Face Recognition.
- **Member 4**: Mapping.

---

## 🛠️ Setup & Installation

```bash
# 1. Clone the repository
git clone [https://github.com/Lekaa-Fouad/Rafiq--.git](https://github.com/Lekaa-Fouad/Rafiq--.git)
cd Rafiq--

# 2. Create and activate a virtual environment
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Install faster-whisper
pip install faster-whisper --no-deps

# 4. Copy and configure environment variables
cp .env.example .env
# Edit the .env file and set a strong API_KEY value!
```
> **Redis (Optional but Recommended)**: Start a local Redis instance for caching before running the server. 
> On Windows with Docker: `docker run -d -p 6379:6379 redis`

---

## 🚀 Running the Application

Start the backend FastAPI server:
```bash
uvicorn main:app --reload --port 8000
```
*Note: The first startup will download the Whisper `base` model (~150 MB). Subsequent starts will use the cached model.*

---

## 📚 API Documentation

| Interface | URL |
|-----------|-----|
| **Swagger UI** (Interactive) | http://localhost:8000/docs |
| **ReDoc** (Read-only) | http://localhost:8000/redoc |
| **OpenAPI JSON** | http://localhost:8000/openapi.json |

*Authentication:* All protected endpoints require an `X-API-Key` header matching the `API_KEY` in your `.env`. In Swagger UI, click **Authorize** (top-right) and enter your key.

## 📂 Project Structure

```text
rafiq/
├── main.py                  # FastAPI app, startup lifespan, router registration
├── .env.example             # Environment variable template (commit this)
├── .env                     # Your local secrets (do NOT commit)
├── requirements.txt         # All Python dependencies
├── README.md                # This file
│
├── core/                    # Config, dependencies, exceptions, responses
├── models/                  # Pydantic schemas (voice, face, ocr, detection, navigation)
├── services/                # Business logic
│   ├── voice_service.py     # ✅ IMPLEMENTED
│   ├── face_service.py      # ✅ IMPLEMENTED
│   ├── ocr_service.py       # 🔧 STUB (Member 1)
│   ├── detection_service.py # 🔧 STUB (Member 2)
│   └── navigation_service.py# 🔧 STUB (Member 4)
│
├── routers/                 # API Endpoint Definitions
│   ├── voice.py             
│   ├── face.py              
│   ├── ocr.py               
│   ├── detection.py         
│   ├── navigation.py        
│   ├── health.py            
│   └── ws.py                
│
├── db/
│   └── face_db.py           # Async SQLite CRUD for face embeddings
│
└── data/                    # Created automatically at startup
    ├── faces.db             # SQLite database (gitignored)
    └── embeddings/          # Reserved for future use (gitignored)
```

---

## 📝 Developer Notes & Guidelines
- **AI Model Loading:** Do not reload heavy models (like Whisper) inside request handlers. They live in `app.state` to ensure they are loaded only once on startup.
- **File Handling:** Always delete temporary files in a `finally` block to prevent memory/storage leaks (see `voice_service.transcribe_audio` for an example).
- **Testing APIs:** Test your integrations using the interactive Swagger UI at `/docs`.
- **Database & Cache:** Redis is optional; if unavailable, the server simply skips caching and continues serving requests. The Face DB uses SQLite and is generated automatically on the first run.
- **Coding Standards:** For detailed team implementation rules, definitions of done, and code architecture patterns, refer to `TEAM_CODE_GUIDE.md` (if applicable).