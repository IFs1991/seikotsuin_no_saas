export interface AIComment {
  id: string;
  clinic_id?: string;
  date: string;
  summary: string;
  highlights: string[];
  improvements: string[];
  suggestions: string[];
  created_at: string;
}

export interface AICommentCardProps {
  comment: AIComment;
  className?: string;
}
