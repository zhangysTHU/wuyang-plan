import type {
  Document, Encounter, Identity, ImportPreview, Job, NightDetails, Patient, Snapshot,
} from '../domain'
import type { ImportRequest } from '../radar/adapter'

export interface DashboardData {
  getIdentity(): Identity | null
  login(key: string): Identity
  logout(): void
  subscribe(callback: () => void): () => void
  snapshot(): Promise<Snapshot>
  addPatient(input: Pick<Patient, 'name' | 'description' | 'background'>): Promise<Patient>
  addEncounter(input: Omit<Encounter, 'id'>): Promise<Encounter>
  addDocument(input: Pick<Document, 'encounterId' | 'name' | 'text' | 'source'>): Promise<Document>
  prepareImport(input: ImportRequest): Promise<ImportPreview>
  importNight(preview: ImportPreview): Promise<void>
  generate(patientId: string, nights: number, endDate: string): Promise<void>
  nightDetails(id: string): Promise<NightDetails>
  recalculate(patientId: string, nightId?: string): Promise<void>
  runMorning(): Promise<void>
  example(patientId: string, date: string): Promise<string>
  backup(): Promise<Blob>
}

export type ApiReply<T> =
  | { data: T; error: null; request_id: string }
  | { data: null; error: { code: string; message: string }; request_id: string }

export interface JobAccepted {
  job_id: Job['id']
  status: Job['status'] | 'queued'
}
