/**
 * Faculty Selection API calls (backend: /faculty-selection/*).
 */
import { fetchWithAuth } from '../../lib/apiClient';

const j = (body: any) => ({ body: JSON.stringify(body) });
const enc = encodeURIComponent;

export interface FsRound {
  id: string; department: string; semester_label: string; title: string; status: 'draft' | 'open' | 'closed';
  starts_at: string; ends_at: string; sections: string[]; open_now: boolean;
  eligible_count?: number; subject_count?: number; selection_count?: number;
}
export interface FsOffering {
  id: string; subject_id: string; group_id: string; group_name: string; section: string;
  faculty_email: string; faculty_name: string; capacity: number; filled: number;
}
export interface FsRoundDetail extends FsRound {
  groups: { id: string; name: string }[];
  subjects: { id: string; subject_name: string; subject_type: 'Theory' | 'Lab'; sort_order: number }[];
  offerings: FsOffering[];
  eligible_count: number;
  eligible_sections: string[];
}
export interface FsPickResult {
  subject_id: string; offering_id: string; subject_name: string | null; ok: boolean; status: number;
  code?: string; message?: string; faculty_name?: string; section?: string; created_at?: string;
}
export interface FsStudentView {
  round: FsRound; server_time: string;
  student: { roll_number: string; name: string; section: string };
  group: { id: string; name: string } | null;
  subjects: {
    id: string; subject_name: string; subject_type: string;
    selection: { id: string; status: 'active' | 'released'; created_at: string; faculty_name: string | null; group_name: string | null } | null;
    options: { id: string; group_id: string; group_name: string; faculty_name: string; capacity: number; remaining: number; allowed: boolean }[];
  }[];
}

export const fsApi = {
  // admin / HOD
  rounds: (): Promise<FsRound[]> => fetchWithAuth('/faculty-selection/rounds'),
  createRound: (b: any): Promise<FsRound> => fetchWithAuth('/faculty-selection/rounds', { method: 'POST', ...j(b) }),
  round: (id: string): Promise<FsRoundDetail> => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}`),
  updateRound: (id: string, b: any) => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}`, { method: 'PUT', ...j(b) }),
  setStatus: (id: string, status: string) => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}/status`, { method: 'POST', ...j({ status }) }),
  deleteRound: (id: string) => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}`, { method: 'DELETE' }),
  eligible: (id: string): Promise<any[]> => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}/eligible`),
  addEligible: (id: string, rolls: string[]) => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}/eligible`, { method: 'POST', ...j({ rolls }) }),
  removeEligible: (id: string, roll: string) => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}/eligible/${enc(roll)}`, { method: 'DELETE' }),
  addGroup: (id: string, name: string) => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}/groups`, { method: 'POST', ...j({ name }) }),
  renameGroup: (gid: string, name: string) => fetchWithAuth(`/faculty-selection/groups/${enc(gid)}`, { method: 'PUT', ...j({ name }) }),
  deleteGroup: (gid: string) => fetchWithAuth(`/faculty-selection/groups/${enc(gid)}`, { method: 'DELETE' }),
  addSubject: (id: string, b: any) => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}/subjects`, { method: 'POST', ...j(b) }),
  updateSubject: (sid: string, b: any) => fetchWithAuth(`/faculty-selection/subjects/${enc(sid)}`, { method: 'PUT', ...j(b) }),
  deleteSubject: (sid: string) => fetchWithAuth(`/faculty-selection/subjects/${enc(sid)}`, { method: 'DELETE' }),
  facultyOptions: (): Promise<{ name: string; email: string; department: string }[]> => fetchWithAuth('/faculty-selection/faculty-options'),
  addOffering: (sid: string, b: any) => fetchWithAuth(`/faculty-selection/subjects/${enc(sid)}/offerings`, { method: 'POST', ...j(b) }),
  updateOffering: (oid: string, b: any) => fetchWithAuth(`/faculty-selection/offerings/${enc(oid)}`, { method: 'PUT', ...j(b) }),
  deleteOffering: (oid: string) => fetchWithAuth(`/faculty-selection/offerings/${enc(oid)}`, { method: 'DELETE' }),
  dashboard: (id: string) => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}/dashboard`),
  selections: (id: string): Promise<any[]> => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}/selections`),
  audit: (id: string): Promise<any[]> => fetchWithAuth(`/faculty-selection/rounds/${enc(id)}/audit`),
  release: (sid: string, reason?: string) => fetchWithAuth(`/faculty-selection/selections/${enc(sid)}/release`, { method: 'POST', ...j({ reason }) }),
  reassign: (sid: string, offering_id: string) => fetchWithAuth(`/faculty-selection/selections/${enc(sid)}/reassign`, { method: 'POST', ...j({ offering_id }) }),
  assign: (id: string, b: { roll_number: string; subject_id: string; offering_id: string }) =>
    fetchWithAuth(`/faculty-selection/rounds/${enc(id)}/assign`, { method: 'POST', ...j(b) }),
  departmentSummary: () => fetchWithAuth('/faculty-selection/department-summary'),
  // faculty
  myStudents: (): Promise<any[]> => fetchWithAuth('/faculty-selection/my-students'),
  // student
  me: (): Promise<{ show: boolean; rounds: FsRound[]; allotted: number }> => fetchWithAuth('/faculty-selection/me'),
  myRound: (id: string): Promise<FsStudentView> => fetchWithAuth(`/faculty-selection/me/rounds/${enc(id)}`),
  mySeats: (id: string): Promise<{ open_now: boolean; seats: { id: string; remaining: number; capacity: number }[] }> =>
    fetchWithAuth(`/faculty-selection/me/rounds/${enc(id)}/seats`),
  select: (id: string, choices: { subject_id: string; offering_id: string }[]): Promise<{ results: FsPickResult[] } & FsStudentView> =>
    fetchWithAuth(`/faculty-selection/me/rounds/${enc(id)}/select`, { method: 'POST', ...j({ choices }) }),
  allotted: (): Promise<any[]> => fetchWithAuth('/faculty-selection/me/allotted'),
};

/** dd MMM, HH:mm:ss in the viewer's zone */
export const fmtTime = (v: any, withSeconds = false, withMs = false) =>
  v ? new Date(v).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}), ...(withMs ? { fractionalSecondDigits: 3 } : {}), hour12: false,
  } as Intl.DateTimeFormatOptions) : '—';

/** datetime-local value in the browser's zone */
export const toLocalInput = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
