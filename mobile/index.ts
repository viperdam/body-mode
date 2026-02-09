import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';
import sleepPlanHeadlessTask from './src/tasks/sleepPlanHeadlessTask';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Headless task for wake-triggered plan generation
AppRegistry.registerHeadlessTask('SleepPlanHeadlessTask', () => sleepPlanHeadlessTask);
