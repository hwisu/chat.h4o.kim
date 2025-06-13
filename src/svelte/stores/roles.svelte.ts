// Svelte 5 runes는 전역적으로 사용 가능

export interface RoleInfo {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

export interface RoleState {
  available: RoleInfo[];
  selected: string | null;
  selectedInfo: RoleInfo;
  isLoading: boolean;
}

const initialRoleState: RoleState = {
  available: [],
  selected: null,
  selectedInfo: {
    id: 'general-assistant',
    name: 'General Assistant',
    description: 'Honest feedback and fact‑based support, with a "search‑first" mindset',
    icon: '🎯'
  },
  isLoading: false
};

// Svelte 5 runes 사용
export const rolesState = $state<RoleState>({ ...initialRoleState });

// 역할 관련 헬퍼 함수들
export function updateRoles(rolesData: Partial<RoleState>) {
  Object.assign(rolesState, rolesData);
}

export function setSelectedRole(roleId: string, roleInfo?: Partial<RoleInfo>) {
  rolesState.selected = roleId;
  if (roleInfo) {
    Object.assign(rolesState.selectedInfo, roleInfo);
  }
}

export function setRolesLoading(isLoading: boolean) {
  rolesState.isLoading = isLoading;
}

export function setAvailableRoles(roles: RoleInfo[]) {
  rolesState.available = roles;
}

// 기존 호환성을 위한 별칭
export const rolesStore = rolesState;
