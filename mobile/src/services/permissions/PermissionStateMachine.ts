import * as Location from 'expo-location';
import { globalPermissionMutex } from './PermissionMutex';

export type PermissionDecision = 'granted' | 'denied' | 'undetermined' | 'blocked';

export type PermissionStage =
  | 'IDLE'
  | 'CHECKING'
  | 'FOREGROUND_PROMPT'
  | 'REQUESTING_FOREGROUND'
  | 'FOREGROUND_GRANTED'
  | 'FOREGROUND_DENIED'
  | 'BACKGROUND_PROMPT'
  | 'REQUESTING_BACKGROUND'
  | 'BACKGROUND_GRANTED'
  | 'BACKGROUND_DENIED'
  | 'PERMANENTLY_DENIED'
  | 'ERROR';

export type PermissionDisclosureType = 'foreground' | 'background';

export interface PermissionState {
  current: PermissionStage;
  foreground: PermissionDecision;
  background: PermissionDecision;
  disclosureShown: boolean;
  disclosureAcknowledged: boolean;
  lastChecked: number;
  errorCount: number;
  isTransitioning: boolean;
}

type StateListener = (state: PermissionState) => void;

const DEFAULT_STATE: PermissionState = {
  current: 'IDLE',
  foreground: 'undetermined',
  background: 'undetermined',
  disclosureShown: false,
  disclosureAcknowledged: false,
  lastChecked: 0,
  errorCount: 0,
  isTransitioning: false,
};

type DecisionSource = 'check' | 'request';

const deriveStage = (foreground: PermissionDecision, background: PermissionDecision): PermissionStage => {
  if (foreground === 'blocked' || background === 'blocked') {
    return 'PERMANENTLY_DENIED';
  }
  if (background === 'granted') {
    return 'BACKGROUND_GRANTED';
  }
  if (foreground === 'granted' && background === 'denied') {
    return 'BACKGROUND_DENIED';
  }
  if (foreground === 'granted') {
    return 'FOREGROUND_GRANTED';
  }
  if (foreground === 'denied') {
    return 'FOREGROUND_DENIED';
  }
  return 'IDLE';
};

export class PermissionStateMachine {
  private state: PermissionState;
  private listeners = new Set<StateListener>();
  private blockHints = { foreground: false, background: false };

  constructor(initial?: Partial<PermissionState>) {
    this.state = { ...DEFAULT_STATE, ...initial };
  }

  getState(): PermissionState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setDisclosureShown(shown: boolean): void {
    this.setState({ disclosureShown: shown });
  }

  setDisclosureAcknowledged(acknowledged: boolean): void {
    this.setState({ disclosureAcknowledged: acknowledged });
  }

  resetDisclosure(): void {
    this.setState({ disclosureShown: false, disclosureAcknowledged: false });
  }

  hydrate(partial: Partial<PermissionState>): void {
    this.setState(partial);
  }

  hydrateBlockHints(hints?: Partial<{ foreground: boolean; background: boolean }>): void {
    if (!hints) return;
    if (typeof hints.foreground === 'boolean') this.blockHints.foreground = hints.foreground;
    if (typeof hints.background === 'boolean') this.blockHints.background = hints.background;
  }

  getBlockHints(): { foreground: boolean; background: boolean } {
    return { ...this.blockHints };
  }

  private resolveDecision(
    type: 'foreground' | 'background',
    status: Location.PermissionResponse,
    source: DecisionSource
  ): PermissionDecision {
    if (status.status === 'granted') {
      this.blockHints[type] = false;
      return 'granted';
    }
    if (status.status === 'undetermined') {
      return 'undetermined';
    }

    const canAskAgain = status.canAskAgain !== false;
    if (!canAskAgain) {
      // Expo-location canAskAgain can be wrong on checks.
      // Only escalate to "blocked" after we've already seen a request with canAskAgain=false.
      if (source === 'request') {
        if (this.blockHints[type]) {
          return 'blocked';
        }
        this.blockHints[type] = true;
        return 'denied';
      }
      return this.blockHints[type] ? 'blocked' : 'denied';
    }

    this.blockHints[type] = false;
    return 'denied';
  }

  async checkPermissions(): Promise<PermissionState> {
    return globalPermissionMutex.acquire(async () => {
      this.setState({ current: 'CHECKING', isTransitioning: true });
      try {
        const [fgStatus, bgStatus] = await Promise.all([
          Location.getForegroundPermissionsAsync(),
          Location.getBackgroundPermissionsAsync(),
        ]);

        const foreground = this.resolveDecision('foreground', fgStatus, 'check');
        const background = this.resolveDecision('background', bgStatus, 'check');

        const nextState: PermissionState = {
          ...this.state,
          current: deriveStage(foreground, background),
          foreground,
          background,
          lastChecked: Date.now(),
          isTransitioning: false,
        };
        this.setState(nextState);
        return nextState;
      } catch (error) {
        this.setState({
          current: 'ERROR',
          isTransitioning: false,
          errorCount: this.state.errorCount + 1,
        });
        return this.state;
      }
    });
  }

  async requestForeground(): Promise<boolean> {
    return globalPermissionMutex.acquire(async () => {
      this.setState({ current: 'REQUESTING_FOREGROUND', isTransitioning: true });
      try {
        const fgResult = await Location.requestForegroundPermissionsAsync();
        const foreground = this.resolveDecision('foreground', fgResult, 'request');
        const background = this.state.background;

        this.setState({
          current: deriveStage(foreground, background),
          foreground,
          lastChecked: Date.now(),
          isTransitioning: false,
        });

        return foreground === 'granted';
      } catch (error) {
        this.setState({
          current: 'ERROR',
          isTransitioning: false,
          errorCount: this.state.errorCount + 1,
        });
        return false;
      }
    });
  }

  async requestBackground(): Promise<boolean> {
    return globalPermissionMutex.acquire(async () => {
      if (this.state.foreground !== 'granted') {
        this.setState({
          current: 'ERROR',
          isTransitioning: false,
          errorCount: this.state.errorCount + 1,
        });
        return false;
      }

      this.setState({ current: 'REQUESTING_BACKGROUND', isTransitioning: true });
      try {
        const bgResult = await Location.requestBackgroundPermissionsAsync();
        const background = this.resolveDecision('background', bgResult, 'request');
        const foreground = this.state.foreground;

        this.setState({
          current: deriveStage(foreground, background),
          background,
          lastChecked: Date.now(),
          isTransitioning: false,
        });

        return background === 'granted';
      } catch (error) {
        this.setState({
          current: 'ERROR',
          isTransitioning: false,
          errorCount: this.state.errorCount + 1,
        });
        return false;
      }
    });
  }

  private setState(next: Partial<PermissionState> | PermissionState): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach(listener => listener(this.state));
  }
}

// Shared singleton for location permission state.
export const locationPermissionMachine = new PermissionStateMachine();
