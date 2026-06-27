/**
 * src/services/intentRouter.ts
 * Keyword/pattern-based intent classifier for voice commands.
 *
 * Supports both English and Arabic trigger phrases for each intent.
 * Designed to be easily extensible — add new intents by adding entries
 * to the INTENTS array with trigger patterns and a mapper function.
 *
 * Usage:
 *   const intent = classifyIntent("who is this", "en");
 *   // → { type: 'IDENTIFY_FACE' }
 *
 *   const intent = classifyIntent("وديني لغرفة ٣", "ar");
 *   // → { type: 'NAVIGATE_TO', room: '3' }
 */

// ─── Intent Types ────────────────────────────────────────────────

/** All supported intent types */
export type IntentType =
  | 'DESCRIBE_SURROUNDINGS'
  | 'IDENTIFY_FACE'
  | 'REGISTER_FACE'
  | 'NAVIGATE_TO'
  | 'READ_TEXT'
  | 'DETECT_OBJECTS'
  | 'START_NAVIGATION'
  | 'STOP'
  | 'HELP'
  | 'UNKNOWN';

/** Intent shapes — one per type, forming a proper discriminated union */

export interface DescribeSurroundingsIntent {
  type: 'DESCRIBE_SURROUNDINGS';
}

export interface IdentifyFaceIntent {
  type: 'IDENTIFY_FACE';
}

export interface RegisterFaceIntent {
  type: 'REGISTER_FACE';
  name: string;
}

export interface NavigateToIntent {
  type: 'NAVIGATE_TO';
  room: string;
}

export interface ReadTextIntent {
  type: 'READ_TEXT';
}

export interface DetectObjectsIntent {
  type: 'DETECT_OBJECTS';
}

export interface StartNavigationIntent {
  type: 'START_NAVIGATION';
}

export interface StopIntent {
  type: 'STOP';
}

export interface HelpIntent {
  type: 'HELP';
}

export interface UnknownIntent {
  type: 'UNKNOWN';
  raw: string;
}

/** Union of all intent types — use this for exhaustive checking */
export type Intent =
  | DescribeSurroundingsIntent
  | IdentifyFaceIntent
  | RegisterFaceIntent
  | NavigateToIntent
  | ReadTextIntent
  | DetectObjectsIntent
  | StartNavigationIntent
  | StopIntent
  | HelpIntent
  | UnknownIntent;

// ─── Intent Definitions ──────────────────────────────────────────
//
// Each entry contains:
//   - type:       The intent type to emit
//   - patterns:   Array of regex patterns (English + Arabic)
//   - extract?:   Optional function to pull payload from the transcript
//
// Patterns are tested against the lowercased, trimmed transcript.
// Arabic patterns are tested against the original text (no lowercasing).

interface IntentPattern {
  type: IntentType;
  /** Regex patterns to match — each is tested independently */
  patterns: RegExp[];
  /** Optional: extract payload from the raw transcript */
  extract?: (transcript: string) => Record<string, string> | null;
}

const INTENTS: IntentPattern[] = [
  // ── DESCRIBE SURROUNDINGS ──
  // "What's in front of me?" / "What do you see?" / "إيه قدامي" / "شنوف قدامي"
  {
    type: 'DESCRIBE_SURROUNDINGS',
    patterns: [
      /what'?s?\s+(in\s+front\s+of\s+me|around\s+me|ahead)/i,
      /what\s+do\s+you\s+see/i,
      /describe\s+(the\s+)?(surroundings?|environment|scene|area)/i,
      /look\s+(around|ahead|in\s+front)/i,
      /tell\s+me\s+what'?s?\s+(around|in\s+front)/i,
      /identify\s+(the\s+)?objects?\s+(around|in\s+front)/i,
      // Arabic
      /إيه\s* قدامي/i,
      /شنوف\s* قدامي/i,
      /إيه\s* حواليني/i,
      /وصِّف\s* المكان/i,
      /شنو\s* قدامي/i,
      /شنو\s* حواليني/i,
      /قولي\s* إيه\s* قدامي/i,
      /اعرف\s* المكان/i,
    ],
  },

  // ── IDENTIFY FACE ──
  // "Who is this?" / "Who is standing there?" / "ده مين" / "مين ده"
  {
    type: 'IDENTIFY_FACE',
    patterns: [
      /who\s+is\s+(this|that|standing|in\s+front|there)/i,
      /identify\s+(this\s+)?person/i,
      /recognize\s+(this\s+)?face/i,
      /face\s+recognition/i,
      // Arabic
      /ده\s* مين/i,
      /مين\s* ده/i,
      /هذا\s* مين/i,
      /مين\s* واقف/i,
      /عرف\s* الوجه/i,
      /تعرّف\s* عليا/i,
      /اعرف\s* مين/i,
    ],
  },

  // ── REGISTER FACE ──
  // "Register this face as Ahmed" / "سجّل الوجه ده أحمد"
  {
    type: 'REGISTER_FACE',
    patterns: [
      /register\s+(this\s+)?(face|person)\s+(as|named?|called?)\s+(.+)/i,
      /save\s+(this\s+)?(face|person)\s+(as|named?|called?)\s+(.+)/i,
      /add\s+(this\s+)?(face|person)\s+(as|named?|called?)\s+(.+)/i,
      /remember\s+(this\s+)?(face|person)\s+(as|named?|called?)\s+(.+)/i,
      // Arabic
      /سجّل\s+(ال)?وجه\s*(ده|ذا)?\s*(إسمه?|اسمها?)?\s*(.+)/i,
      /حفظ\s+(ال)?وجه\s*(ده|ذا)?\s*(إسمه?|اسمها?)?\s*(.+)/i,
    ],
    extract: (transcript) => {
      // English patterns
      let match = transcript.match(
        /(?:register|save|add|remember)\s+(?:this\s+)?(?:face|person)\s+(?:as|named?|called?)\s+(.+)/i,
      );
      if (match?.[1]) return { name: match[1].trim() };

      // Arabic patterns — extract the name part
      match = transcript.match(
        /(?:سجّل|حفظ)\s+(?:ال)?وجه\s*(?:ده|ذا)?\s*(?:إسمه?|اسمها?)?\s*(.+)/i,
      );
      if (match?.[1]) return { name: match[1].trim() };

      return null;
    },
  },

  // ── NAVIGATE TO ──
  // "Take me to room 3" / "Navigate to the bathroom" / "وديني لغرفة ٣"
  {
    type: 'NAVIGATE_TO',
    patterns: [
      /take\s+me\s+to\s+(.+)/i,
      /navigate\s+to\s+(.+)/i,
      /go\s+to\s+(the\s+)?(.+)/i,
      /where\s+is\s+(the\s+)?(.+)/i,
      /how\s+(do\s+)?(i\s+)?get\s+to\s+(the\s+)?(.+)/i,
      // Arabic
      /وديني\s+(لـ|لِ)?(.+)/i,
      /اودعني\s+(لـ|لِ)?(.+)/i,
      /ريني\s+(الطريق\s+)?(لـ|لِ)?(.+)/i,
      /فين\s+(ال)?(.+)/i,
      /روح\s+(لـ|لِ)?(.+)/i,
      /اوديني\s+(لـ|لِ)?(.+)/i,
    ],
    extract: (transcript) => {
      // English: "take me to X" / "navigate to X" / "go to X"
      let match = transcript.match(/(?:take\s+me\s+to|navigate\s+to)\s+(.+)/i);
      if (match?.[1]) return { room: match[1].trim() };

      match = transcript.match(/go\s+to\s+(?:the\s+)?(.+)/i);
      if (match?.[1]) return { room: match[1].trim() };

      match = transcript.match(/where\s+is\s+(?:the\s+)?(.+)/i);
      if (match?.[1]) return { room: match[1].trim() };

      match = transcript.match(/(?:how\s+(?:do\s+)?(?:i\s+)?)?get\s+to\s+(?:the\s+)?(.+)/i);
      if (match?.[1]) return { room: match[1].trim() };

      // Arabic: "وديني لـ X" / "فين X"
      match = transcript.match(/(?:وديني|اودعني|اوديني)\s+(?:لـ|لِ)?\s*(.+)/i);
      if (match?.[1]) return { room: match[1].trim() };

      match = transcript.match(/(?:ريني\s+)?(?:الطريق\s+)?(?:لـ|لِ)?\s*(.+)/i);
      if (match?.[1]) return { room: match[1].trim() };

      match = transcript.match(/فين\s+(?:ال)?(.+)/i);
      if (match?.[1]) return { room: match[1].trim() };

      match = transcript.match(/روح\s+(?:لـ|لِ)?\s*(.+)/i);
      if (match?.[1]) return { room: match[1].trim() };

      return null;
    },
  },

  // ── READ TEXT (OCR) ──
  // "Read this text" / "اقرأ النص ده"
  {
    type: 'READ_TEXT',
    patterns: [
      /read\s+(this\s+)?(text|sign|document|paper|label|writing)/i,
      /what\s+does\s+(this\s+)?(text|sign|writing|it)\s+say/i,
      /scan\s+(this\s+)?(text|document|paper)/i,
      /ocr/i,
      // Arabic
      /اقرأ\s+(ال)?نص\s*(ده|ذا)?/i,
      /قرّا\s+(ال)?نص\s*(ده|ذا)?/i,
      /شنو\s+مكتوب/i,
      /إيه\s+مكتوب/i,
      /اقرأ\s+الورقة/i,
    ],
  },

  // ── DETECT OBJECTS ──
  // "What objects are there?" / "detect objects" / "اعرف الاشياء"
  {
    type: 'DETECT_OBJECTS',
    patterns: [
      /detect\s+(the\s+)?objects?/i,
      /what\s+objects?\s+(are\s+there|can\s+you\s+see|do\s+you\s+see)/i,
      /object\s+detection/i,
      /scan\s+(the\s+)?(room|area|environment)/i,
      // Arabic
      /اكتشف\s+(ال)?اشياء/i,
      /اعرف\s+(ال)?اشياء/i,
      /شنو\s+الاشياء/i,
      /فيه\s+اشياء/i,
      /فحص\s+المكان/i,
    ],
  },

  // ── START NAVIGATION ──
  // "Start navigating" / "ابدأ التنقل"
  {
    type: 'START_NAVIGATION',
    patterns: [
      /start\s+(indoor\s+)?navigation/i,
      /begin\s+(indoor\s+)?navigation/i,
      /start\s+navigating/i,
      /navigate\s+me\s+inside/i,
      // Arabic
      /ابدأ\s+(ال)?تنقل/i,
      /ابدأ\s+(ال)?تنقّل/i,
      /start\s+التنقل/i,
    ],
  },

  // ── STOP ──
  // "Stop" / "Cancel" / "اهدأ" / "وقّف"
  {
    type: 'STOP',
    patterns: [
      /\bstop\b/i,
      /\bcancel\b/i,
      /\bnever\s*mind\b/i,
      /\bforget\s+it\b/i,
      // Arabic
      /\bوقّف\b/i,
      /\bأوقف\b/i,
      /\bاهدأ\b/i,
      /\bامسح\b/i,
      /\blahi\b/i, // Egyptian colloquial "lahz" / "lahi"
    ],
  },

  // ── HELP ──
  // "Help" / "What can you do?" / "مساعدة"
  {
    type: 'HELP',
    patterns: [
      /\bhelp\b/i,
      /what\s+can\s+you\s+do/i,
      /what\s+commands?\s+(are\s+)?available/i,
      /commands?\s+list/i,
      /how\s+do\s+(i\s+)?use\s+this/i,
      // Arabic
      /\bمساعدة\b/i,
      /إيه\s+تقدر\s+ تعمل/i,
      /شنو\s+تقدر\s+ تعمل/i,
      /\bأوامر\b/i,
    ],
  },
];

// ─── Public API ──────────────────────────────────────────────────

/**
 * Classify a transcript string into a typed Intent.
 *
 * @param transcript  The raw transcript text from STT
 * @param language    Detected language: 'en' or 'ar'
 * @returns A typed Intent object with the classified type and any extracted payload
 */
export function classifyIntent(transcript: string, language: 'en' | 'ar'): Intent {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { type: 'UNKNOWN', raw: trimmed };
  }

  // Test each intent's patterns against the transcript
  for (const intent of INTENTS) {
    const matched = intent.patterns.some((pattern) => pattern.test(trimmed));

    if (matched) {
      // Extract payload if the intent has an extract function
      if (intent.extract) {
        const payload = intent.extract(trimmed);
        if (payload) {
          return { type: intent.type, ...payload } as Intent;
        }
      }

      // No payload needed — return the base intent
      // Cast needed because intent.type is IntentType (union) and TS can't narrow it
      return { type: intent.type } as Intent;
    }
  }

  // No patterns matched — return UNKNOWN with the raw transcript
  return { type: 'UNKNOWN', raw: trimmed };
}

/**
 * Get a human-readable description of an intent (for display / debugging).
 */
export function describeIntent(intent: Intent): string {
  switch (intent.type) {
    case 'DESCRIBE_SURROUNDINGS':
      return 'Describe surroundings';
    case 'IDENTIFY_FACE':
      return 'Identify face';
    case 'REGISTER_FACE':
      return `Register face: ${intent.name}`;
    case 'NAVIGATE_TO':
      return `Navigate to: ${intent.room}`;
    case 'READ_TEXT':
      return 'Read text (OCR)';
    case 'DETECT_OBJECTS':
      return 'Detect objects';
    case 'START_NAVIGATION':
      return 'Start indoor navigation';
    case 'STOP':
      return 'Stop / Cancel';
    case 'HELP':
      return 'Help / Commands list';
    case 'UNKNOWN':
      return `Unknown command: "${intent.raw}"`;
    default:
      return 'Unknown';
  }
}

/**
 * Get a user-facing spoken response for an intent.
 * Useful for confirming what the user asked before executing.
 */
export function getSpokenConfirmation(intent: Intent, language: 'en' | 'ar'): string {
  if (language === 'ar') {
    switch (intent.type) {
      case 'DESCRIBE_SURROUNDINGS':
        return 'حسناً، بوصّفلك المكان';
      case 'IDENTIFY_FACE':
        return 'هبص على الوش';
      case 'REGISTER_FACE':
        return `هبص على الوش وهسيبه متسجل باسم ${intent.name}`;
      case 'NAVIGATE_TO':
        return `هاوديك ${intent.room}`;
      case 'READ_TEXT':
        return 'هقرألك النص';
      case 'DETECT_OBJECTS':
        return 'هكتبلك على الاشياء في المكان';
      case 'START_NAVIGATION':
        return 'هبدأ التنقل';
      case 'STOP':
        return 'تمام، وقّفت';
      case 'HELP':
        return 'تقدر تقول: وصّف المكان، مين ده، اقرأ النص، أو وينيني لغرفة';
      case 'UNKNOWN':
        return 'مش فاهم الأمر. قول "مساعدة" عشان تعرف الأوامر المتاحة';
      default:
        return '';
    }
  }

  // English
  switch (intent.type) {
    case 'DESCRIBE_SURROUNDINGS':
      return "Okay, let me describe what's around you.";
    case 'IDENTIFY_FACE':
      return 'Let me look at the face.';
    case 'REGISTER_FACE':
      return `I'll register this face as ${intent.name}.`;
    case 'NAVIGATE_TO':
      return `Taking you to ${intent.room}.`;
    case 'READ_TEXT':
      return 'Reading the text for you.';
    case 'DETECT_OBJECTS':
      return 'Detecting objects in the area.';
    case 'START_NAVIGATION':
      return 'Starting indoor navigation.';
    case 'STOP':
      return 'Stopped.';
    case 'HELP':
      return 'You can say: describe surroundings, who is this, read text, or take me to a room.';
    case 'UNKNOWN':
      return "I didn't understand that. Say help for a list of commands.";
    default:
      return '';
  }
}