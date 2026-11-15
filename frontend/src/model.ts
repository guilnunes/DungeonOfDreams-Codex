// Projection types only. Source IDs, content, and capabilities arrive from
// the authenticated backend; no authored project dataset lives in this repo.
export type Entry = {
  id: string;
  title: string;
  category: string;
  kind: string;
  status: string;
  body: string;
  revision: string | number;
  canEdit?: boolean;
  canHistory?: boolean;
  format?: string;
  provider?: string;
  source?: string;
  provenance?: string;
  updated?: string;
  [key: string]: any;
};
export type Session = { displayName: string; csrfToken: string };
