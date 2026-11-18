import extendedVoicesRaw from '../panel/extended-voices.json';

export interface VoiceItem {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  style: string;
  category: 'featured' | 'library';
  language: string;
  languageCode: string;
  accent: string;
  persona: string;
  context?: string;
  pitch: 'low' | 'medium' | 'high';
  description: string;
}

const languageDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'language' })
    : null;

export function formatLanguageLabel(code: string): string {
  try {
    return languageDisplayNames?.of(code) || code;
  } catch {
    return code;
  }
}

export const FEATURED_VOICES: VoiceItem[] = [
  { id: 'Kore', name: 'Kore', gender: 'female', style: 'Firm', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Conversational', pitch: 'medium', description: 'Firm, grounded female voice suitable for professional dialogues and assistant responses.' },
  { id: 'Puck', name: 'Puck', gender: 'male', style: 'Upbeat', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Conversational', pitch: 'medium', description: 'Upbeat, energetic male voice with an approachable, friendly tone.' },
  { id: 'Charon', name: 'Charon', gender: 'male', style: 'Informative', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Narrator', pitch: 'low', description: 'Informative, deep, and measured male voice ideal for documentation and technical briefings.' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'male', style: 'Excitable', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Storyteller', pitch: 'medium', description: 'Excitable, dynamic male delivery with dramatic vocal inflection.' },
  { id: 'Aoede', name: 'Aoede', gender: 'female', style: 'Breezy', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Conversational', pitch: 'high', description: 'Breezy, light, and natural feminine cadence.' },
  { id: 'Zephyr', name: 'Zephyr', gender: 'female', style: 'Bright', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Digital Assistant', pitch: 'high', description: 'Bright, cheerful, and crisp tone for modern interactive assistants.' },
  { id: 'Leda', name: 'Leda', gender: 'female', style: 'Youthful', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Conversational', pitch: 'high', description: 'Youthful, vibrant vocal energy with clear articulation.' },
  { id: 'Orus', name: 'Orus', gender: 'male', style: 'Firm', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Authoritative Advisor', pitch: 'low', description: 'Firm, resonant baritone tone with authoritative clarity.' },
  { id: 'Enceladus', name: 'Enceladus', gender: 'male', style: 'Breathy', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Storyteller', pitch: 'low', description: 'Breathy, intimate, and warm male narrator.' },
  { id: 'Iapetus', name: 'Iapetus', gender: 'male', style: 'Clear', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Technical Advisor', pitch: 'medium', description: 'Clear, articulate, neutral broadcast presentation.' },
  { id: 'Algieba', name: 'Algieba', gender: 'male', style: 'Smooth', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Audiobook', pitch: 'medium', description: 'Smooth, steady pacing ideal for narrative audiobooks.' },
  { id: 'Algenib', name: 'Algenib', gender: 'male', style: 'Gravelly', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Character', pitch: 'low', description: 'Gravelly, textured mature timbre.' },
  { id: 'Achernar', name: 'Achernar', gender: 'female', style: 'Soft', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Storyteller', pitch: 'low', description: 'Soft, gentle storytelling voice with calm pacing.' },
  { id: 'Gacrux', name: 'Gacrux', gender: 'female', style: 'Mature', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Narrator', pitch: 'low', description: 'Mature, dignified, and articulate presentation.' },
  { id: 'Achird', name: 'Achird', gender: 'male', style: 'Friendly', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Conversational', pitch: 'medium', description: 'Friendly, warm, and natural everyday conversational tone.' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', gender: 'male', style: 'Casual', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Podcaster', pitch: 'medium', description: 'Casual, relaxed, unhurried podcast host delivery.' },
  { id: 'Sadaltager', name: 'Sadaltager', gender: 'male', style: 'Knowledgeable', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Technical Advisor', pitch: 'medium', description: 'Knowledgeable, analytical tone tailored for educational narration.' },
  { id: 'Sulafat', name: 'Sulafat', gender: 'female', style: 'Warm', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Conversational', pitch: 'medium', description: 'Warm, reassuring, and empathetic customer-care presence.' },
  { id: 'Sadachbia', name: 'Sadachbia', gender: 'male', style: 'Lively', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Podcaster', pitch: 'medium', description: 'Lively, spirited vocal delivery.' },
  { id: 'Schedar', name: 'Schedar', gender: 'male', style: 'Even', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'News Anchor', pitch: 'medium', description: 'Even, balanced, non-distracting neutral cadence.' },
  { id: 'Autonoe', name: 'Autonoe', gender: 'female', style: 'Bright', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Digital Assistant', pitch: 'high', description: 'Bright, crisp, and articulate vocal clarity.' },
  { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'female', style: 'Easy-going', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Conversational', pitch: 'medium', description: 'Easy-going, relaxed conversational partner.' },
  { id: 'Despina', name: 'Despina', gender: 'female', style: 'Smooth', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Audiobook', pitch: 'medium', description: 'Smooth, melodic vocal contours for long-form listening.' },
  { id: 'Erinome', name: 'Erinome', gender: 'female', style: 'Clear', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'News Anchor', pitch: 'medium', description: 'Clear, steady, broadcast-ready female voice.' },
  { id: 'Laomedeia', name: 'Laomedeia', gender: 'female', style: 'Upbeat', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Conversational', pitch: 'high', description: 'Upbeat, friendly, and engaging presence.' },
  { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'female', style: 'Forward', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Authoritative Advisor', pitch: 'medium', description: 'Forward, direct, and confident communicative presence.' },
  { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'male', style: 'Informative', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Narrator', pitch: 'medium', description: 'Informative, documentary-style narration.' },
  { id: 'Umbriel', name: 'Umbriel', gender: 'male', style: 'Easy-going', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Conversational', pitch: 'low', description: 'Easy-going, laid-back male demeanor.' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'female', style: 'Gentle', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Storyteller', pitch: 'medium', description: 'Gentle, kind, and attentive voice for bedtime stories or meditation.' },
  { id: 'Alnilam', name: 'Alnilam', gender: 'male', style: 'Firm', category: 'featured', language: 'English (US)', languageCode: 'en-US', accent: 'American', persona: 'Authoritative Advisor', pitch: 'low', description: 'Firm, decisive, and commanding vocal quality.' },
];

type RawExtendedVoice = {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  languageCode: string;
  accent: string;
  persona: string;
  context: string;
  pitch: 'low' | 'medium' | 'high';
  description: string;
};

export const EXTENDED_VOICES: VoiceItem[] = (extendedVoicesRaw as RawExtendedVoice[]).map((v) => ({
  id: v.id,
  name: v.name,
  gender: v.gender,
  style: v.accent,
  category: 'library',
  language: formatLanguageLabel(v.languageCode),
  languageCode: v.languageCode,
  accent: v.accent,
  persona: v.persona,
  context: v.context,
  pitch: v.pitch,
  description: v.description,
}));

export const ALL_VOICES: VoiceItem[] = [...FEATURED_VOICES, ...EXTENDED_VOICES];
