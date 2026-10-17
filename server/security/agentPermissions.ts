import { auditLogger } from './auditLog';
import type { AuthenticatedUser } from './auth';

export type AgentToolId =
  | 'generate_image'
  | 'generate_specialized_image'
  | 'search_internet_images'
  | 'generate_video'
  | 'google_search'
  | 'search_web'
  | 'execute_code'
  | 'execute_terminal_command'
  | 'create_file'
  | 'inspect_system'
  | 'adk_coordinate_agents'
  | 'read_file'
  | 'write_file'
  | 'call_external_api'
  | 'create_task'
  | 'query_memory'
  | 'save_memory';

export interface AgentPermissionPolicy {
  allowedTools: AgentToolId[];
  maxDailyToolCalls: number;
  requireApprovalForDestructive: boolean;
  safeModeOnly: boolean;
}

const DEFAULT_GUEST_POLICY: AgentPermissionPolicy = {
  allowedTools: [
    'generate_image',
    'generate_specialized_image',
    'search_internet_images',
    'generate_video',
    'google_search',
    'search_web',
    'execute_code',
    'execute_terminal_command',
    'create_file',
    'read_file',
    'write_file',
    'call_external_api',
    'create_task',
    'query_memory',
    'save_memory',
    'inspect_system',
    'adk_coordinate_agents',
  ],
  maxDailyToolCalls: 1000,
  requireApprovalForDestructive: false,
  safeModeOnly: false,
};

const DEFAULT_USER_POLICY: AgentPermissionPolicy = {
  allowedTools: [
    'generate_image',
    'generate_specialized_image',
    'search_internet_images',
    'generate_video',
    'google_search',
    'search_web',
    'execute_code',
    'execute_terminal_command',
    'create_file',
    'create_task',
    'query_memory',
    'save_memory',
    'inspect_system',
    'adk_coordinate_agents',
    'read_file',
    'write_file',
    'call_external_api',
  ],
  maxDailyToolCalls: 500,
  requireApprovalForDestructive: false,
  safeModeOnly: false,
};

const DEFAULT_ADMIN_POLICY: AgentPermissionPolicy = {
  allowedTools: [
    'generate_image',
    'generate_specialized_image',
    'search_internet_images',
    'generate_video',
    'google_search',
    'search_web',
    'execute_code',
    'execute_terminal_command',
    'create_file',
    'inspect_system',
    'adk_coordinate_agents',
    'read_file',
    'write_file',
    'call_external_api',
    'create_task',
    'query_memory',
    'save_memory',
  ],
  maxDailyToolCalls: 10000,
  requireApprovalForDestructive: false,
  safeModeOnly: false,
};

export class AgentPermissionGuard {
  public static getPolicyForUser(user?: AuthenticatedUser): AgentPermissionPolicy {
    if (!user) return DEFAULT_GUEST_POLICY;
    if (user.role === 'admin') return DEFAULT_ADMIN_POLICY;
    if (user.role === 'user') return DEFAULT_USER_POLICY;
    return DEFAULT_GUEST_POLICY;
  }

  public static canExecuteTool(
    toolName: string,
    user?: AuthenticatedUser,
    context?: { ip?: string; resource?: string }
  ): { allowed: boolean; reason?: string } {
    const policy = this.getPolicyForUser(user);
    const normalizedTool = toolName.toLowerCase() as AgentToolId;

    const isAllowed = policy.allowedTools.includes(normalizedTool);

    if (!isAllowed) {
      auditLogger.log({
        userId: user?.uid || 'anonymous',
        ip: context?.ip || '0.0.0.0',
        action: 'AGENT_TOOL_DENIED',
        resource: toolName,
        outcome: 'DENIED',
        riskScore: 50,
        metadata: { role: user?.role, policyAllowed: policy.allowedTools },
      });

      return {
        allowed: false,
        reason: `Agent tool '${toolName}' is not permitted for your current role (${user?.role || 'guest'}).`,
      };
    }

    auditLogger.log({
      userId: user?.uid || 'anonymous',
      ip: context?.ip || '0.0.0.0',
      action: 'AGENT_TOOL_INVOKED',
      resource: toolName,
      outcome: 'SUCCESS',
      riskScore: 5,
      metadata: { role: user?.role },
    });

    return { allowed: true };
  }
}
