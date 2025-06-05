// Svelte 5 runes는 전역적으로 사용 가능

export interface ModelInfo {
  name: string;
  provider: string;
  contextSize: number;
}

export interface ModelState {
  available: any[];
  selected: string | null;
  selectedInfo: ModelInfo;
  isLoading: boolean;
}

const initialModelState: ModelState = {
  available: [],
  selected: null,
  selectedInfo: {
    name: 'whoami',
    provider: '',
    contextSize: 128000
  },
  isLoading: false
};

// Svelte 5 runes 사용
export const modelsState = $state<ModelState>({ ...initialModelState });

// 모델 관련 헬퍼 함수들
export function updateModels(modelsData: Partial<ModelState>) {
  Object.assign(modelsState, modelsData);
}

export function setSelectedModel(modelId: string, modelInfo?: Partial<ModelInfo>) {
  modelsState.selected = modelId;
  if (modelInfo) {
    Object.assign(modelsState.selectedInfo, modelInfo);
  }
}

export function setModelsLoading(isLoading: boolean) {
  modelsState.isLoading = isLoading;
}

export function setAvailableModels(models: any[]) {
  modelsState.available = models;
} 
