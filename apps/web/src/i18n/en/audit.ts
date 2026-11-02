import type { audit as source } from '../uk/audit';
import type { Dictionary } from '../types';

export const audit = {
  action: {
    CRM_EXPORT: "CRM export",
    CLIENT_VIEW: "Customer viewed",
    DOCUMENT_DOWNLOAD: "Document downloaded",
  },
  title: "Audit log",
  description: "Actions on sensitive data",
  export: "Export log",
  search: "Search events",
  searchPlaceholder: "Employee, action or IP",
  result: "Result",
  allResults: "All results",
  success: "Succeeded",
  denied: "Denied",
  count: "Events: {{count}}",
  col: {
    time: "Time",
    employee: "Employee",
    action: "Action",
    object: "Object",
    ip: "IP address",
  },
  empty: "No events",
  emptyText: "The log is empty for these filters",
} satisfies Dictionary<typeof source>;
