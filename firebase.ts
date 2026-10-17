import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Inizializza Firestore indicando il databaseId specificato nella configurazione
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

export interface PreventivoItem {
  id: string;
  name: string;
  rilegatura: string;
  rilegaturaId?: string;
  rilegaturaPrezzo: number;
  isOmaggio?: boolean;
  bwPages: number;
  colorPages: number;
  cps: number;
  costoSubtotale: number;
}

export interface PreventivoData {
  cliente: string;
  totale: number;
  totaleLordo?: number;
  totaleScontoRilegature?: number;
  scontoConvenzione?: number;
  isConvenzione?: boolean;
  convenzioneNome?: string;
  tipoConsegna?: 'ritiro' | 'spedizione_sda';
  costoSpedizione?: number;
  copieTotali: number;
  items: PreventivoItem[];
  stato: 'nuovo' | 'in_lavorazione' | 'completato' | 'annullato';
}

function cleanUndefined<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined) as unknown as T;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = cleanUndefined(value);
    }
  }
  return cleaned as T;
}

export const savePreventivoToFirestore = async (data: PreventivoData) => {
  try {
    const rawPayload = {
      ...data,
      categoria: data.isConvenzione ? `CONVENZIONE ${data.convenzioneNome || 'OXFORD'}` : 'STAMPE E RILEGATURE',
      createdAt: serverTimestamp(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      dispositivo: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : ''
    };
    const cleanedPayload = cleanUndefined(rawPayload);
    const preventiviRef = collection(db, 'preventivi');
    const docRef = await addDoc(preventiviRef, cleanedPayload);
    console.log('Preventivo salvato su Firestore con ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Errore durante il salvataggio su Firestore:', error);
    throw error;
  }
};
