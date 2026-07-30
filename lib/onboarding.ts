import type { LucideIcon } from 'lucide-react'
import {
  Home,
  Building2,
  Warehouse,
  TreePine,
  Palmtree,
  KeyRound,
  Wind,
  Flame,
  Droplet,
  Zap,
  ShowerHead,
  Trees,
  Waves,
  Refrigerator,
  Sun,
  Car,
  Cpu,
  Layers,
  FileText,
  Receipt,
  ShieldCheck,
  BookOpen,
  Image,
  Video,
  StickyNote,
  CalendarCheck,
  FolderOpen,
  PiggyBank,
  Hammer,
  Brain,
  Building,
  Palette,
} from 'lucide-react'

export const STEP_COUNT = 4

export const stepMeta: { id: number; label: string; optional?: boolean }[] = [
  { id: 1, label: 'Welcome' },
  { id: 2, label: 'Your home', optional: true },
  { id: 3, label: 'Goals', optional: true },
  { id: 4, label: 'First insight', optional: true },
]

/* Progress framed as GatheredOS accomplishing something, not just advancing forms. */
export const stepPhase: Record<number, string> = {
  1: 'Getting started',
  2: 'Finding your home',
  3: 'Personalizing your priorities',
  4: 'Creating your first useful result',
}

/* ---------- Selectable option sets ---------- */

export type TileOption = { key: string; label: string; icon: LucideIcon; hint?: string }

export const propertyTypes: TileOption[] = [
  { key: 'single-family', label: 'Single-family home', icon: Home },
  { key: 'townhome', label: 'Townhome', icon: Building2 },
  { key: 'condo', label: 'Condo', icon: Building },
  { key: 'cabin', label: 'Cabin', icon: TreePine },
  { key: 'vacation', label: 'Vacation home', icon: Palmtree },
  { key: 'rental', label: 'Rental property', icon: KeyRound },
]

export const homeFeatures: TileOption[] = [
  { key: 'basement', label: 'Basement', icon: Layers },
  { key: 'deck', label: 'Deck', icon: Warehouse },
  { key: 'pool', label: 'Pool', icon: Waves },
  { key: 'irrigation', label: 'Irrigation', icon: Droplet },
  { key: 'fireplace', label: 'Fireplace', icon: Flame },
  { key: 'septic', label: 'Septic', icon: ShowerHead },
  { key: 'well', label: 'Well', icon: Droplet },
  { key: 'generator', label: 'Generator', icon: Zap },
  { key: 'solar', label: 'Solar', icon: Sun },
  { key: 'garage', label: 'Garage', icon: Car },
  { key: 'smart-home', label: 'Smart-home devices', icon: Cpu },
]

export const majorSystems: TileOption[] = [
  { key: 'hvac', label: 'HVAC', icon: Wind },
  { key: 'water-heater', label: 'Water heater', icon: Flame },
  { key: 'roof', label: 'Roof', icon: Home },
  { key: 'plumbing', label: 'Plumbing', icon: Droplet },
  { key: 'electrical', label: 'Electrical', icon: Zap },
  { key: 'irrigation', label: 'Irrigation', icon: Trees },
  { key: 'sump-pump', label: 'Sump pump', icon: Waves },
  { key: 'appliances', label: 'Appliances', icon: Refrigerator },
]

/* Common manufacturers per system, so users tap instead of type. */
export const manufacturerSuggestions: Record<string, string[]> = {
  hvac: ['Carrier', 'Lennox', 'Trane', 'Bryant', 'Rheem'],
  'water-heater': ['Rheem', 'A.O. Smith', 'Bradford White', 'Navien'],
  roof: ['GAF', 'Owens Corning', 'CertainTeed', 'Malarkey'],
  plumbing: ['Kohler', 'Moen', 'Delta', 'American Standard'],
  electrical: ['Square D', 'Eaton', 'Siemens', 'GE'],
  irrigation: ['Rain Bird', 'Hunter', 'Toro', 'Orbit'],
  'sump-pump': ['Zoeller', 'Wayne', 'Liberty', 'Superior'],
  appliances: ['Whirlpool', 'GE', 'Samsung', 'LG', 'Bosch'],
}

export const defaultManufacturers = ['Carrier', 'GE', 'Whirlpool', 'Kohler', 'Rheem']

export const uploadKinds: TileOption[] = [
  { key: 'document', label: 'Document', icon: FileText },
  { key: 'receipt', label: 'Receipt', icon: Receipt },
  { key: 'warranty', label: 'Warranty', icon: ShieldCheck },
  { key: 'manual', label: 'Manual', icon: BookOpen },
  { key: 'photo', label: 'Photo', icon: Image },
  { key: 'video', label: 'Video', icon: Video },
  { key: 'note', label: 'Note', icon: StickyNote },
]

export const uploadExamples: { label: string; icon: LucideIcon }[] = [
  { label: 'Roof warranty', icon: ShieldCheck },
  { label: 'Furnace manual', icon: BookOpen },
  { label: 'Water-shutoff photo', icon: Image },
  { label: 'Paint label', icon: Palette },
  { label: 'Sprinkler walkthrough video', icon: Video },
]

export const knowledgePrompts: { key: string; prompt: string; icon: LucideIcon }[] = [
  { key: 'sprinkler', prompt: 'Who winterizes the sprinkler system?', icon: Trees },
  { key: 'breaker', prompt: 'Which breaker controls the basement?', icon: Zap },
  { key: 'paint', prompt: 'Where are the extra paint cans?', icon: Palette },
  { key: 'garage', prompt: 'How do you reset the garage door?', icon: KeyRound },
]

export const captureMethods: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'note', label: 'Write a note', icon: StickyNote },
  { key: 'photo', label: 'Take a photo', icon: Image },
  { key: 'video', label: 'Record video', icon: Video },
  { key: 'voice', label: 'Voice note', icon: Waves },
]

export type Role = 'Owner' | 'Family Member' | 'Guest'
export const roles: Role[] = ['Owner', 'Family Member', 'Guest']
export const roleHints: Record<Role, string> = {
  Owner: 'Manages everything',
  'Family Member': 'Can add and edit',
  Guest: 'Can view only',
}

/* Ordered by how common each motivation is, most common first. */
export const goals: TileOption[] = [
  { key: 'maintenance', label: 'Stay on top of maintenance', icon: CalendarCheck },
  { key: 'documents', label: 'Organize my home documents', icon: FolderOpen },
  { key: 'projects', label: 'Plan home projects', icon: Hammer },
  { key: 'savings', label: 'Save money', icon: PiggyBank },
  { key: 'understand', label: 'Understand my home better', icon: Brain },
  { key: 'bought', label: 'Just bought this home', icon: KeyRound },
  { key: 'moved', label: 'Recently moved', icon: Home },
]

export type OnboardingDestination = 'home' | 'inspection' | 'document' | 'photo' | 'bulk'

/* ---------- Persisted state ---------- */

export type SystemDetail = {
  key: string
  year?: string
  manufacturer?: string
  nextService?: string
  unsure?: boolean
}

export type Member = { id: string; name: string; email: string; role: Role }

export type KnowledgeEntry = { key: string; method: string }

export type OnboardingData = {
  home: {
    street: string
    city: string
    state: string
    zip: string
    yearBuilt: string
    sqft: string
    beds: string
    baths: string
    propertyType: string
  }
  homeType: string
  features: string[]
  systems: SystemDetail[]
  uploads: { name: string; kind: string }[]
  knowledge: KnowledgeEntry[]
  members: Member[]
  goals: string[]
}

export const emptyOnboarding: OnboardingData = {
  home: {
    street: '',
    city: '',
    state: '',
    zip: '',
    yearBuilt: '',
    sqft: '',
    beds: '',
    baths: '',
    propertyType: '',
  },
  homeType: '',
  features: [],
  systems: [],
  uploads: [],
  knowledge: [],
  members: [],
  goals: [],
}

/* Friendly short name for a home, e.g. "42 Willow Lane" -> "Willow Lane".
   Strips a leading house number so copy can say "We found Willow Lane." */
export function homeShortName(street: string): string {
  const trimmed = street.trim()
  if (!trimmed) return 'your home'
  const withoutNumber = trimmed.replace(/^\d+\s+/, '')
  return withoutNumber || trimmed
}

const STORAGE_PREFIX = 'gatheredos_onboarding_v2'
const STEP_PREFIX = 'gatheredos_onboarding_step_v2'

function scopedKey(prefix: string, userId: string): string {
  return `${prefix}_${userId}`
}

export function loadOnboarding(userId: string): { data: OnboardingData; step: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(scopedKey(STORAGE_PREFIX, userId))
    const step = window.localStorage.getItem(scopedKey(STEP_PREFIX, userId))
    if (!raw) return null
    const restoredStep = step ? Number(step) : 1
    return {
      data: { ...emptyOnboarding, ...JSON.parse(raw) },
      step: Number.isFinite(restoredStep) ? Math.min(STEP_COUNT, Math.max(1, restoredStep)) : 1,
    }
  } catch {
    return null
  }
}

export function saveOnboarding(data: OnboardingData, step: number, userId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(scopedKey(STORAGE_PREFIX, userId), JSON.stringify(data))
    window.localStorage.setItem(scopedKey(STEP_PREFIX, userId), String(step))
  } catch {
    /* ignore quota errors */
  }
}

export function clearOnboarding(userId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(scopedKey(STORAGE_PREFIX, userId))
  window.localStorage.removeItem(scopedKey(STEP_PREFIX, userId))
  window.localStorage.removeItem(STORAGE_PREFIX)
  window.localStorage.removeItem(STEP_PREFIX)
  window.localStorage.removeItem('gatheredos_onboarding_v1')
  window.localStorage.removeItem('gatheredos_onboarding_step_v1')
}
