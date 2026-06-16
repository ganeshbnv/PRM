export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Space {
  id: string;
  name: string;
  key: string;
  description?: string;
  iconEmoji: string;
  isPrivate: boolean;
  createdAt: string;
  creator?: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  _count?: { pages: number; members: number };
}

export interface PageTreeNode {
  id: string;
  title: string;
  emoji: string;
  parentId: string | null;
  position: number;
  status: string;
  children: PageTreeNode[];
}

export interface PageAccessEntry {
  id: string;
  grantedAt: string;
  user: Pick<User, 'id' | 'name' | 'avatarUrl'> & { email: string };
}

export interface Page {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'published' | 'archived';
  emoji: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  spaceId: string;
  parentId?: string;
  creator: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  space?: Pick<Space, 'id' | 'name' | 'key'>;
  children?: PageTreeNode[];
  _count?: { comments: number; views: number };
}

export interface Comment {
  id: string;
  body: string;
  isResolved: boolean;
  anchorText?: string;
  createdAt: string;
  updatedAt: string;
  author: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  replies?: Comment[];
  _count?: { replies: number };
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Notification {
  id: string;
  type: 'comment' | 'mention' | 'page_update';
  title: string;
  body: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PageVersion {
  id: string;
  version: number;
  title: string;
  content?: string;
  comment?: string;
  createdAt: string;
  author: Pick<User, 'id' | 'name' | 'avatarUrl'>;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  emoji: string;
  snippet: string;
  updatedAt: string;
  space: Pick<Space, 'id' | 'name' | 'key'>;
  creator: Pick<User, 'id' | 'name' | 'avatarUrl'>;
}
