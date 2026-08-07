export const API_ENDPOINTS = {
  auth: {
    login: '/auth/login/',
    refresh: '/auth/token/refresh/',
    logout: '/auth/logout/',
    profile: '/auth/profile/',
  },

  dashboard: {
    overview: '/dashboard/overview/',
    documents: '/dashboard/documents/',
    approvals: '/dashboard/approvals/',
    extractions: '/dashboard/extractions/',
    ragUsage: '/dashboard/rag-usage/',
    recentActivity: '/dashboard/recent-activity/',
  },

  documents: {
    base: '/documents/',
  },

  workspaces: {
    departments: '/workspaces/departments/',
    memberships: '/workspaces/memberships/',
  },

  ai: {
    chat: '/ai/chat/',
    externalChat: '/ai/external-chat/',
    conversations: '/ai/conversations/',
    externalDocuments: '/ai/external-documents/',
    externalDocumentsBulkUpload: '/ai/external-documents/bulk-upload/',
    llmProviders: '/ai/llm-providers/',
  },

  approvals: {
    base: '/approvals/',
  },

  workflows: {
    extractionTemplates: '/workflows/extraction-templates/',
    extractionRuns: '/workflows/extraction-runs/',
  },

  notifications: {
    base: '/notifications/',
    unreadCount: '/notifications/unread-count/',
  },

  vectorSearch: {
    search: '/vector-search/search/',
  },
} as const;
