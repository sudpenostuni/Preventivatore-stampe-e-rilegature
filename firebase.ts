import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

// Configurazione ibrida: supporta sia le variabili d'ambiente VITE_ (per evitare avvisi nei commit Git)
// sia il file firebase-applet-config.json generato dall'ambiente AI Studio.
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {} as Record<string, any>;

const activeFirebaseConfig = {
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
};

const app = getApps().length === 0 ? initializeApp(activeFirebaseConfig) : getApp();

// Inizializza Firestore indicando il databaseId specificato nella configurazione
export const db = getFirestore(app, activeFirebaseConfig.firestoreDatabaseId || '(default)');

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: true,
      tenantId: null,
      providerInfo: [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'preventivi', '_connection_check'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
if (typeof window !== 'undefined') {
  testConnection();
}

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
  telefono: string;
  indirizzoSpedizione?: string;
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
  const path = 'preventivi';
  try {
    const rawPayload = {
      ...data,
      categoria: data.isConvenzione ? `CONVENZIONE ${data.convenzioneNome || 'OXFORD'}` : 'STAMPE E RILEGATURE',
      createdAt: serverTimestamp(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      dispositivo: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : ''
    };
    const cleanedPayload = cleanUndefined(rawPayload);
    const preventiviRef = collection(db, path);
    const docRef = await addDoc(preventiviRef, cleanedPayload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

